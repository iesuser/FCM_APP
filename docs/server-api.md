# სერვერის API

საბაზო URL მითითებულია [src/config.ts](../src/config.ts)-ში. აპი იყენებს `/api/v1` API-ს. ყველა მოთხოვნას აქვს `Content-Type: application/json` და `Accept: application/json` headers; მოთხოვნებს აქვს 20-წამიანი timeout.

## მოწყობილობის რეგისტრაცია

### რეგისტრაციის შემოწმება

`GET /api/v1/devices/<device_id>`

აპი გაშვებისას ჯერ ამ მოთხოვნით ამოწმებს device-ს. თუ პასუხი წარმატებულია, ხელახალი რეგისტრაცია არ ხდება.

### რეგისტრაცია

`POST /api/v1/devices/`

მოწყობილობის რეგისტრაციას ასრულებს [deviceInit.ts](../src/deviceInit.ts). `device_id` ინსტალაციაზე ერთხელ იქმნება და AsyncStorage-ში ინახება.

```json
{
  "device_id": "installation-uuid",
  "platform": "android",
  "language": "ka",
  "app_version": "1.0.0"
}
```

უკვე არსებული `device_id`-ის ხელახლა გაგზავნა აახლებს მოწყობილობის `last_seen_at` მნიშვნელობას. FCM token ამ მოთხოვნაში არ იგზავნება.

## FCM token-ები

### Token-ის რეგისტრაცია

`POST /api/v1/devices/<device_id>/fcm-tokens/`

```json
{
  "fcm_token": "FCM_DEVICE_TOKEN"
}
```

ამ მოთხოვნას ასრულებს [sendFcmToken.ts](../src/sendFcmToken.ts). Token-ის მიღების შემდეგ აპი ჯერ device-ს არეგისტრირებს, შემდეგ კი token-ს ცალკე აგზავნის.

### Device-ის token-ების ნახვა

`GET /api/v1/devices/<device_id>/fcm-tokens/`

### Token-ის წაშლა

`DELETE /api/v1/devices/<device_id>/fcm-tokens/<token_id>`

Push notification-ის გამორთვისას აპი token-ების სიას იღებს და device-ის ყველა token-ს შლის. შემდეგ ლოკალურ Firebase token-საც აუქმებს.

## ლოკაციის მდგომარეობა

`GET /api/v1/devices/<device_id>/location/`

აბრუნებს გაზიარების მდგომარეობას და ბოლო ლოკაციას. ლოკაციის ველები `null` იქნება, სანამ სერვერი ლოკაციას არ მიიღებს.

`PATCH /api/v1/devices/<device_id>/location/`

```json
{
  "location_sharing_enabled": true
}
```

გაზიარების გამორთვა ბოლო შენახულ კოორდინატებს ინარჩუნებს.

## ლოკაციის გაგზავნა

`PUT /api/v1/devices/<device_id>/location/`

ეს მოთხოვნა ანაცვლებს მოწყობილობის ბოლო შენახულ კოორდინატებს. მოწყობილობა წინასწარ უნდა იყოს რეგისტრირებული და ლოკაციის გაზიარება ჩართული უნდა ჰქონდეს.

```json
{
  "latitude": 41.7151,
  "longitude": 44.8271,
  "accuracy": 12.5,
  "recorded_at": "2026-11-04T12:00:00.000Z"
}
```

`latitude` და `longitude` სავალდებულოა; `accuracy` და `recorded_at` არჩევითია. `recorded_at` არის GPS-ის დაფიქსირების დრო, ხოლო პასუხში `location_updated_at` არის სერვერზე შენახვის დრო.

გაზიარების ჩართვა (`PATCH`) მხოლოდ გაზიარების სტატუსს ცვლის და ლოკაციას არ აგზავნის. კოორდინატების გასაგზავნად გამოიყენეთ `PUT`. მოწყობილობის არყოფნისას სერვერი აბრუნებს `404`-ს, ხოლო გაზიარების გამორთვისას — `403`-ს.

## მიწისძვრის შეტყობინების არეალი

`GET /api/v1/devices/<device_id>/alert-settings` აბრუნებს მოწყობილობის მიმდინარე არეალსა და მინიმალურ მაგნიტუდას (`404`, თუ პარამეტრები ჯერ არ არის შენახული).

`PUT /api/v1/devices/<device_id>/alert-settings` ქმნის ან ანახლებს მოწყობილობის ერთადერთ alert არეალს. `area` უნდა იყოს GeoJSON `Polygon` ან `MultiPolygon` (SRID 4326; კოორდინატების მიმდევრობაა longitude, latitude).

```json
{
  "device_id": "installation-uuid",
  "enabled": true,
  "min_magnitude": 3.0,
  "area_source": "custom",
  "area": {
    "type": "MultiPolygon",
    "coordinates": [[[[44.80, 41.70], [44.90, 41.70], [44.90, 41.80], [44.80, 41.70]]]]
  },
  "updated_at": "2026-11-10T12:00:00.000Z"
}
```

## სხვა API რესურსები

API ასევე შეიცავს alert settings, felt reports, earthquakes და notifications რესურსებს. მათი სრული სქემა და სტატუსები იხილეთ backend-ის Swagger დოკუმენტაციაში: `http://localhost:5000/docs/`.

Firebase Admin SDK-ის service account-ის private key მხოლოდ backend-ზე შეინახეთ და არასდროს ჩართოთ მობილურ bundle-ში.
