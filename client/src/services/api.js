// API helper for correct endpoint routing in dev/prod modes

const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
const API_BASE = isDev ? 'http://localhost:3001' : window.location.origin;

export async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  // Ensure credentials are included by default
  const fetchOptions = {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  console.log(`[API] ${options.method || 'GET'} ${endpoint} → ${url}`);

  try {
    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error) {
    console.error(`[API] Error calling ${endpoint}:`, error);
    throw error;
  }
}

export async function apiCallJson(endpoint, options = {}) {
  const response = await apiCall(endpoint, options);

  if (!response.ok) {
    console.error(`[API] Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export { API_BASE };

