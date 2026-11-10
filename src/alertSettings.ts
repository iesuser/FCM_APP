import { API_BASE_URL } from './config';

const TIMEOUT_MS = 20_000;
const API_ROOT = `${API_BASE_URL.replace(/\/+$/, '')}/api/v1`;

type GeoJSONPosition = [number, number];

export type AlertArea = {
  type: 'MultiPolygon';
  coordinates: GeoJSONPosition[][][];
};

export type AlertSettings = {
  device_id: string;
  enabled: boolean;
  min_magnitude: number;
  area_source: 'custom' | 'circle';
  area: AlertArea | { type: 'Polygon'; coordinates: GeoJSONPosition[][] };
  updated_at: string;
};

class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request(url: string, method: 'GET' | 'PUT', body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const excerpt = (await response.text()).trim().slice(0, 180);
      const message = excerpt
        ? `სერვერმა დააბრუნა ${response.status}: ${excerpt}`
        : `სერვერმა დააბრუნა ${response.status}.`;
      throw new ApiRequestError(response.status, message);
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

function endpoint(deviceId: string): string {
  return `${API_ROOT}/devices/${encodeURIComponent(deviceId)}/alert-settings`;
}

export async function getAlertSettings(deviceId: string): Promise<AlertSettings | null> {
  const url = endpoint(deviceId);
  try {
    const response = await request(url, 'GET');
    return (await response.json()) as AlertSettings;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveAlertSettings(
  deviceId: string,
  settings: Pick<AlertSettings, 'area' | 'min_magnitude' | 'enabled'>,
): Promise<void> {
  await request(endpoint(deviceId), 'PUT', {
    device_id: deviceId,
    enabled: settings.enabled,
    min_magnitude: settings.min_magnitude,
    area_source: 'custom',
    area: settings.area,
    updated_at: new Date().toISOString(),
  });
}
