// src/utils/api.js
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export const api = axios.create({ baseURL });

api.interceptors.request.use(config => {
  try {
    const stored = JSON.parse(localStorage.getItem('camp-auth') || '{}');
    const token = stored?.state?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('camp-auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
