import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MapView, { Marker, Polygon, Polyline, type LatLng, type Region } from 'react-native-maps';

import { getAlertSettings, saveAlertSettings, type AlertArea } from '../alertSettings';
import { deviceInit } from '../deviceInit';

const DEFAULT_REGION: Region = {
  latitude: 41.7151,
  longitude: 44.8271,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};
const MAGNITUDE_OPTIONS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

function getSavedPoints(area: AlertArea | { type: 'Polygon'; coordinates: [number, number][][] }): LatLng[] {
  const rawCoordinates = area.coordinates as unknown[];
  let ring: unknown;
  if (area.type === 'Polygon') {
    ring = rawCoordinates[0];
  } else {
    const firstPolygon = rawCoordinates[0] as unknown[] | undefined;
    ring = firstPolygon?.[0];
  }
  if (!Array.isArray(ring)) return [];

  const points = ring.flatMap((position): LatLng[] => {
    if (!Array.isArray(position) || position.length < 2) return [];
    const [longitude, latitude] = position;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return [];
    return [{ latitude, longitude }];
  });
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.latitude === last.latitude && first.longitude === last.longitude) points.pop();
  }
  return points;
}

function getInitialRegion(points: LatLng[]): Region {
  if (points.length === 0) return DEFAULT_REGION;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.8, 0.04),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.8, 0.04),
  };
}

export default function AreaSelectionScreen() {
  const [points, setPoints] = useState<LatLng[]>([]);
  const [minMagnitude, setMinMagnitude] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const id = await deviceInit();
        const settings = await getAlertSettings(id);
        if (!active || !settings) return;
        setPoints(getSavedPoints(settings.area));
        setMinMagnitude(settings.min_magnitude);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'შენახული არეალის ჩატვირთვა ვერ მოხერხდა.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const initialRegion = useMemo(() => getInitialRegion(points), [points]);

  const removePoint = (index: number) => {
    setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };

  const save = async () => {
    if (points.length < 3) {
      setError('პოლიგონის შესაქმნელად რუკაზე მინიმუმ 3 წერტილი მონიშნე.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const deviceId = await deviceInit();
      const ring: [number, number][] = points.map(({ latitude, longitude }) => [longitude, latitude]);
      ring.push(ring[0]);
      const area: AlertArea = { type: 'MultiPolygon', coordinates: [[ring]] };
      await saveAlertSettings(deviceId, { area, min_magnitude: minMagnitude, enabled: true });
      Alert.alert('შენახულია', 'არეალი და მინიმალური მაგნიტუდა განახლდა.');
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'პარამეტრების შენახვა ვერ მოხერხდა.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹ უკან</Text>
          </Pressable>
          <Text style={styles.heading}>შეტყობინების არეალი</Text>
          <Text style={styles.instruction}>რუკას შეეხე წერტილების დასამატებლად, მარკერები კი გადაათრიე ფორმის შესაცვლელად. წერტილის წაშლა რუკის ქვემოთ შეგიძლია (მინ. 3 წერტილი).</Text>
        </View>

        {Platform.OS === 'web' ? (
          <View style={styles.webFallback}>
            <Text style={styles.meta}>არეალის რუკა ხელმისაწვდომია iOS და Android აპში.</Text>
          </View>
        ) : loading ? (
          <View style={styles.loading}><ActivityIndicator color="#0F4C81" /></View>
        ) : (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={initialRegion}
              onPress={(event) => setPoints((current) => [...current, event.nativeEvent.coordinate])}
              loadingEnabled
              toolbarEnabled={false}
            >
              {points.length >= 3 ? (
                <Polygon
                  coordinates={points}
                  strokeColor="#0F4C81"
                  strokeWidth={3}
                  fillColor="rgba(15, 76, 129, 0.2)"
                />
              ) : points.length >= 2 ? (
                <Polyline coordinates={points} strokeColor="#0F4C81" strokeWidth={3} />
              ) : null}
              {points.map((point, index) => (
                <Marker
                  key={`area-point-${index}`}
                  coordinate={point}
                  draggable
                  title={`წერტილი ${index + 1}`}
                  description="გადაათრიე პოლიგონის ფორმის შესაცვლელად"
                  onDragEnd={(event) => {
                    const nextCoordinate = event.nativeEvent.coordinate;
                    setPoints((current) => current.map((existing, pointIndex) => (
                      pointIndex === index ? nextCoordinate : existing
                    )));
                  }}
                >
                  <View style={styles.numberedMarker}>
                    <Text style={styles.numberedMarkerText}>{index + 1}</Text>
                  </View>
                </Marker>
              ))}
            </MapView>
          </View>
        )}

        <View style={styles.controls}>
          <Text style={styles.controlTitle}>წერტილები: {points.length} · წასაშლელად შეეხე ×-ს</Text>
          {points.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pointsRow}>
              {points.map((_, index) => (
                <View key={`point-action-${index}`} style={styles.pointChip}>
                  <Text style={styles.pointChipText}>{index + 1}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`წერტილი ${index + 1}-ის წაშლა`}
                    onPress={() => removePoint(index)}
                    hitSlop={6}
                    style={styles.deletePointButton}
                  >
                    <Text style={styles.deletePointText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.controlTitle}>მინიმალური მაგნიტუდა</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.magnitudeRow}>
            {MAGNITUDE_OPTIONS.map((magnitude) => (
              <Pressable
                key={magnitude}
                accessibilityRole="radio"
                accessibilityState={{ selected: minMagnitude === magnitude }}
                onPress={() => setMinMagnitude(magnitude)}
                style={[styles.magnitudeChip, minMagnitude === magnitude && styles.selectedChip]}
              >
                <Text style={[styles.chipText, minMagnitude === magnitude && styles.selectedChipText]}>{magnitude.toFixed(1)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => void save()} disabled={saving || loading || Platform.OS === 'web'} style={[styles.saveButton, (saving || loading || Platform.OS === 'web') && styles.saveDisabled]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>არეალის შენახვა</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEF3F8' },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 5 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  backText: { color: '#0F4C81', fontSize: 16, fontWeight: '700' },
  heading: { color: '#102033', fontSize: 23, fontWeight: '700' },
  instruction: { color: '#5E7088', fontSize: 13, lineHeight: 18 },
  mapContainer: { flex: 1, minHeight: 230, position: 'relative' },
  map: StyleSheet.absoluteFill,
  numberedMarker: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 7,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#0F4C81',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#102033',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  numberedMarkerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  loading: { flex: 1, minHeight: 230, alignItems: 'center', justifyContent: 'center' },
  webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  controls: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 9, backgroundColor: '#FFFFFF' },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointChip: { minWidth: 42, height: 38, paddingLeft: 11, paddingRight: 6, borderRadius: 19, backgroundColor: '#E7EEF6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pointChipText: { color: '#41556D', fontSize: 13, fontWeight: '700' },
  deletePointButton: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FCE9E7', alignItems: 'center', justifyContent: 'center' },
  deletePointText: { color: '#B42318', fontSize: 18, lineHeight: 21, fontWeight: '700' },
  controlTitle: { color: '#102033', fontSize: 14, fontWeight: '700' },
  magnitudeRow: { gap: 8, paddingVertical: 1 },
  magnitudeChip: { minWidth: 48, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: '#E7EEF6', alignItems: 'center' },
  selectedChip: { backgroundColor: '#0F4C81' },
  chipText: { color: '#41556D', fontSize: 13, fontWeight: '700' },
  selectedChipText: { color: '#FFFFFF' },
  error: { color: '#A32020', fontSize: 13, lineHeight: 18 },
  saveButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F4C81' },
  saveDisabled: { opacity: 0.55 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  meta: { color: '#5E7088', fontSize: 14, textAlign: 'center' },
});
