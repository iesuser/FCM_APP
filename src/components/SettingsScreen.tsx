import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';

import {
  disableFcmToken,
  getNotificationPermission,
  obtainFcmToken,
  requestNotificationPermission,
} from '../fcm';
import { LocationPermissionError, readCurrentLocation, requestLocationPermission } from '../gps';
import { sendLocation, updateLocationSharing } from '../sendLocation';
import { disableFcmTokenOnServer, sendFcmToken } from '../sendFcmToken';
import { deviceInit } from '../deviceInit';
import {
  isLocationSharingPending,
  loadDeviceId,
  loadLocationSharing,
  loadPushNotificationsEnabled,
  saveLocationSharing,
  savePushNotificationsEnabled,
  setLocationSharingPending,
} from '../storage';

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function SettingsScreen() {
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    const [savedLocation, id, pending, savedNotifications, permission, locationPermission] = await Promise.all([
      loadLocationSharing(),
      loadDeviceId(),
      isLocationSharingPending(),
      loadPushNotificationsEnabled(),
      getNotificationPermission(),
      Location.getForegroundPermissionsAsync(),
    ]);
    const effectiveLocationEnabled = savedLocation && locationPermission.granted;
    if (savedLocation && !locationPermission.granted) {
      await saveLocationSharing(false);
      await setLocationSharingPending(true);
    }
    setLocationEnabled(effectiveLocationEnabled);
    setDeviceId(id);

    const notificationsPreference = savedNotifications ?? permission.granted;
    if (savedNotifications === null) {
      await savePushNotificationsEnabled(notificationsPreference);
    }
    setNotificationsEnabled(notificationsPreference && permission.granted);

    if (pending) {
      try {
        await deviceInit();
        await updateLocationSharing(id, effectiveLocationEnabled);
        await setLocationSharingPending(false);
        setLocationMessage('გაზიარების მდგომარეობა სერვერთან სინქრონიზებულია.');
      } catch {
        setLocationError('ცვლილება შენახულია და სერვერთან მოგვიანებით გაიგზავნება.');
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshSettings();
  }, [refreshSettings]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshSettings();
      }
    });
    return () => subscription.remove();
  }, [refreshSettings]);

  const toggleLocationSharing = useCallback(async (enabled: boolean) => {
    setLocationBusy(true);
    setLocationError(null);
    setLocationMessage(null);
    try {
      if (enabled) {
        await requestLocationPermission();
      }
      const id = deviceId ?? (await loadDeviceId());
      setDeviceId(id);
      setLocationEnabled(enabled);
      await saveLocationSharing(enabled);
      await setLocationSharingPending(true);
      let pushToken: string | undefined;
      if (enabled) {
        const notificationPermission = await getNotificationPermission();
        const notificationsPreference = await loadPushNotificationsEnabled();
        if (notificationPermission.granted && notificationsPreference !== false) {
          try {
            pushToken = await obtainFcmToken();
          } catch {
            // Location sharing remains available when FCM is not configured.
          }
        }
      }
      await deviceInit();
      if (pushToken) {
        await sendFcmToken(id, pushToken);
      }
      await updateLocationSharing(id, enabled);
      await setLocationSharingPending(false);
      if (!enabled) {
        setLocationMessage('ლოკაციის გაზიარება გამორთულია. სერვერზე ბოლო კოორდინატები შენარჩუნებულია.');
        return;
      }
      try {
        const fix = await readCurrentLocation();
        await sendLocation({
          device_id: id,
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy,
          recorded_at: fix.recordedAt,
        });
        setLocationMessage('გაზიარება ჩართულია და მიმდინარე ლოკაცია სერვერზე განახლდა.');
      } catch (error) {
        setLocationError(`გაზიარება ჩართულია, მაგრამ ლოკაციის განახლება ვერ მოხერხდა: ${errorText(error, 'უცნობი შეცდომა')}`);
      }
    } catch (error) {
      if (enabled && error instanceof LocationPermissionError) {
        setLocationEnabled(false);
        if (error.canAskAgain) {
          setLocationError('ლოკაციის ნებართვა არ გაიცა. შეგიძლიათ ხელახლა სცადოთ.');
        } else {
          setLocationError('ნებართვის ხელახლა მოთხოვნა ტელეფონის პარამეტრებიდან შეგიძლიათ.');
          Alert.alert(
            'ლოკაციის ნებართვა საჭიროა',
            'ტელეფონმა ნებართვის მოთხოვნა აღარ აჩვენა. ჩასართავად დაუშვით ლოკაცია აპის პარამეტრებში.',
            [
              { text: 'ახლა არა', style: 'cancel' },
              { text: 'პარამეტრების გახსნა', onPress: () => void Linking.openSettings() },
            ],
          );
        }
      } else {
        setLocationError(errorText(error, 'მდგომარეობის შეცვლა ვერ მოხერხდა.'));
      }
    } finally {
      setLocationBusy(false);
    }
  }, [deviceId]);

  const toggleNotifications = useCallback(async (enabled: boolean) => {
    setNotificationsBusy(true);
    setNotificationsError(null);
    try {
      if (Platform.OS === 'web') {
        setNotificationsError('Push შეტყობინებები ხელმისაწვდომია მხოლოდ მობილურ აპში.');
        return;
      }
      if (enabled) {
        const permission = await requestNotificationPermission();
        if (!permission.granted) {
          if (permission.canAskAgain) {
            setNotificationsError('შეტყობინებების ნებართვა არ გაიცა. შეგიძლიათ ხელახლა სცადოთ.');
          } else {
            await savePushNotificationsEnabled(true);
            setNotificationsError('ნებართვის ჩასართავად გადადით ტელეფონის პარამეტრებში.');
            Alert.alert(
              'შეტყობინებების ნებართვა საჭიროა',
              'ტელეფონმა ნებართვის მოთხოვნა აღარ აჩვენა. ჩასართავად დაუშვით შეტყობინებები აპის პარამეტრებში.',
              [
                { text: 'ახლა არა', style: 'cancel' },
                { text: 'პარამეტრების გახსნა', onPress: () => void Linking.openSettings() },
              ],
            );
          }
          return;
        }
        const pushToken = await obtainFcmToken();
        const id = deviceId ?? (await loadDeviceId());
        setDeviceId(id);
        await deviceInit();
        await sendFcmToken(id, pushToken);
        await savePushNotificationsEnabled(true);
        setNotificationsEnabled(true);
      } else {
        const id = deviceId ?? (await loadDeviceId());
        setDeviceId(id);
        await disableFcmTokenOnServer(id);
        await disableFcmToken();
        await savePushNotificationsEnabled(false);
        setNotificationsEnabled(false);
      }
    } catch (error) {
      setNotificationsError(errorText(error, 'შეტყობინებების პარამეტრის შეცვლა ვერ მოხერხდა.'));
    } finally {
      setNotificationsBusy(false);
    }
  }, [deviceId]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>პარამეტრები</Text>
          <Text style={styles.lead}>მართეთ ლოკაციის გაზიარება და push შეტყობინებები.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>ლოკაციის გაზიარება</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.value}>{locationEnabled ? 'ჩართულია' : 'გამორთულია'}</Text>
                <Text style={styles.meta}>მდგომარეობა სერვერს device_id-ით ეგზავნება.</Text>
              </View>
              {locationBusy ? <ActivityIndicator color="#0F4C81" /> : null}
              <Switch
                accessibilityLabel="ლოკაციის გაზიარება"
                value={locationEnabled}
                onValueChange={(value) => void toggleLocationSharing(value)}
                disabled={locationBusy}
                trackColor={{ false: '#AAB8C8', true: '#79B99A' }}
                thumbColor={locationEnabled ? '#0F7A45' : '#F4F6F8'}
              />
            </View>
            {deviceId ? <Text style={styles.meta}>device_id: {deviceId}</Text> : null}
            {locationMessage ? <Text style={styles.success}>{locationMessage}</Text> : null}
            {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>შეტყობინებების მიღება</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.value}>{notificationsEnabled ? 'ჩართულია' : 'გამორთულია'}</Text>
                <Text style={styles.meta}>
                  გამორთვისას FCM ტოკენი წაიშლება; ხელახლა ჩართვის შემდეგ ლოკაცია ერთხელ გააგზავნეთ.
                </Text>
              </View>
              {notificationsBusy ? <ActivityIndicator color="#0F4C81" /> : null}
              <Switch
                accessibilityLabel="Push შეტყობინებების მიღება"
                value={notificationsEnabled}
                onValueChange={(value) => void toggleNotifications(value)}
                disabled={notificationsBusy}
                trackColor={{ false: '#AAB8C8', true: '#79B99A' }}
                thumbColor={notificationsEnabled ? '#0F7A45' : '#F4F6F8'}
              />
            </View>
            {notificationsError ? <Text style={styles.error}>{notificationsError}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>შეტყობინების არეალი</Text>
            <Text style={styles.meta}>მონიშნე რუკაზე არეალი და აირჩიე მინიმალური მაგნიტუდა.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/area')}
              style={({ pressed }) => [styles.areaButton, pressed && styles.areaButtonPressed]}
            >
              <Text style={styles.areaButtonText}>მონიშნე არეალი</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEF3F8' },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  heading: { fontSize: 28, fontWeight: '700', color: '#102033' },
  lead: { color: '#5E7088', fontSize: 15, lineHeight: 22, marginBottom: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#102033' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingCopy: { flex: 1, gap: 4 },
  value: { color: '#102033', fontSize: 18, fontWeight: '600' },
  meta: { color: '#5E7088', fontSize: 13, lineHeight: 18 },
  error: { color: '#A32020', fontSize: 14, lineHeight: 20 },
  success: { color: '#0F7A45', fontSize: 14, lineHeight: 20 },
  areaButton: { minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F4C81' },
  areaButtonPressed: { opacity: 0.82 },
  areaButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
