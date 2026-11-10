import type { LocationPayload } from './types';
import { API_BASE_URL } from './config';

const TIMEOUT_MS = 20_000;
const API_ROOT = `${API_BASE_URL.replace(/\/+$/, '')}/api/v1`;

async function request(url: string, method: 'PATCH' | 'PUT', body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const excerpt = (await response.text()).trim().slice(0, 180);
      throw new Error(
        excerpt
          ? `სერვერმა დააბრუნა ${response.status}: ${excerpt}`
          : `სერვერმა დააბრუნა ${response.status}.`,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('სერვერმა პასუხი 20 წამში არ დააბრუნა.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function updateLocationSharing(deviceId: string, enabled: boolean): Promise<void> {
  await request(
    `${API_ROOT}/devices/${encodeURIComponent(deviceId)}/location/`,
    'PATCH',
    { location_sharing_enabled: enabled },
  );
}

export async function sendLocation(payload: LocationPayload): Promise<string> {
  const response = await request(
    `${API_ROOT}/devices/${encodeURIComponent(payload.device_id)}/location/`,
    'PUT',
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
      ...(payload.accuracy != null ? { accuracy: payload.accuracy } : {}),
      recorded_at: payload.recorded_at,
    },
  );
  const responseText = await response.text();
  let locationUpdatedAt: string | undefined;
  try {
    const result: { location_updated_at?: unknown } = JSON.parse(responseText);
    if (typeof result.location_updated_at === 'string') {
      locationUpdatedAt = result.location_updated_at;
    }
  } catch {
    // Keep success handling compatible with servers that return an empty/non-JSON body.
  }

  if (locationUpdatedAt) {
    const timestamp = new Date(locationUpdatedAt);
    if (!Number.isNaN(timestamp.getTime())) {
      return `გაიგზავნა (${response.status}); სერვერზე განახლდა ${timestamp.toLocaleString()}.`;
    }
  }
  return `გაიგზავნა (${response.status}).`;
}
