// node_modules
import { defineStore } from 'pinia';
import { isAxiosError } from 'axios';
import { ref } from 'vue';

// classes
import { authApi } from '@/classes/api';

export const useAuthStore = defineStore('auth', () => {
  // -------------------------------------------------- Data --------------------------------------------------
  const token = ref<string | null>(localStorage.getItem('token'));
  const username = ref<string | null>(null);
  const validated = ref<boolean>(false);

  // -------------------------------------------------- Methods --------------------------------------------------
  const login = async (u: string, p: string): Promise<boolean> => {
    try {
      const response = await authApi.login(u, p);
      token.value = response.data.token;
      localStorage.setItem('token', response.data.token);
      validated.value = true;
      username.value = u;
      return true;
    } catch {
      return false;
    }
  };

  const validate = async (): Promise<boolean> => {
    if (!token.value) return false;
    try {
      const response = await authApi.validate();
      if (response.data.valid) {
        validated.value = true;
        username.value = response.data.username;
        return true;
      }
      // explicit invalid response from backend
      logout();
      return false;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        // Only clear auth state for actual authorization failures.
        if (status === 401 || status === 403) {
          logout();
          return false;
        }
      }
      // Server restart/network issue: keep token and stay logged in.
      return true;
    }
  };

  const setToken = (newToken: string, newUsername: string): void => {
    token.value = newToken;
    username.value = newUsername;
    validated.value = true;
    localStorage.setItem('token', newToken);
  };

  const logout = (): void => {
    token.value = null;
    username.value = null;
    validated.value = false;
    localStorage.removeItem('token');
  };

  // -------------------------------------------------- Export --------------------------------------------------
  return {
    // data
    token,
    username,
    validated,
    // methods
    login,
    validate,
    setToken,
    logout
  };
});
