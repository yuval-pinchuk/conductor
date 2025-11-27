// src/api/client.js

const DEFAULT_BASE_URL = 'http://127.0.0.1:5000';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || DEFAULT_BASE_URL;

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  if (requestOptions.body && typeof requestOptions.body !== 'string') {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(url, requestOptions);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || response.statusText);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export { API_BASE_URL, request };

