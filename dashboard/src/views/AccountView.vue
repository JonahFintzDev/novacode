<script setup lang="ts">
// node_modules
import { ref } from 'vue';

// stores
import { useAuthStore } from '@/stores/auth';

// components
import PageShell from '@/components/layout/PageShell.vue';

// classes
import { authApi } from '@/classes/api';

// -------------------------------------------------- Data --------------------------------------------------
const authStore = useAuthStore();
const accountNewUsername = ref<string>('');
const accountCurrentPassword = ref<string>('');
const accountNewPassword = ref<string>('');
const accountConfirmPassword = ref<string>('');
const bChangingUsername = ref<boolean>(false);
const bChangingPassword = ref<boolean>(false);
const accountUsernameError = ref<string>('');
const accountPasswordError = ref<string>('');
const accountUsernameSuccess = ref<boolean>(false);
const accountPasswordSuccess = ref<boolean>(false);

// -------------------------------------------------- Methods --------------------------------------------------
const changeUsername = async (): Promise<void> => {
  accountUsernameError.value = '';
  accountUsernameSuccess.value = false;
  const newUsername = accountNewUsername.value.trim();
  if (!newUsername) {
    accountUsernameError.value = 'Enter a new username and your current password.';
    return;
  }
  if (newUsername === authStore.username) {
    accountUsernameError.value = 'New username is the same as current.';
    return;
  }
  bChangingUsername.value = true;
  try {
    const response = await authApi.changeUsername(newUsername);
    authStore.setToken(response.data.token, newUsername);
    accountNewUsername.value = '';
    accountUsernameSuccess.value = true;
    setTimeout(() => {
      accountUsernameSuccess.value = false;
    }, 3000);
  } catch (err: unknown) {
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
    accountUsernameError.value = msg ?? 'Failed to change username.';
  } finally {
    bChangingUsername.value = false;
  }
};

const changePassword = async (): Promise<void> => {
  accountPasswordError.value = '';
  accountPasswordSuccess.value = false;
  const current = accountCurrentPassword.value;
  const newP = accountNewPassword.value;
  const confirm = accountConfirmPassword.value;
  if (!current || !newP || !confirm) {
    accountPasswordError.value = 'Fill in all password fields.';
    return;
  }
  if (newP.length < 8) {
    accountPasswordError.value = 'New password must be at least 8 characters.';
    return;
  }
  if (newP !== confirm) {
    accountPasswordError.value = 'New password and confirmation do not match.';
    return;
  }
  bChangingPassword.value = true;
  try {
    await authApi.changePassword(current, newP);
    accountCurrentPassword.value = '';
    accountNewPassword.value = '';
    accountConfirmPassword.value = '';
    accountPasswordSuccess.value = true;
    setTimeout(() => {
      accountPasswordSuccess.value = false;
    }, 3000);
  } catch (err: unknown) {
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
    accountPasswordError.value = msg ?? 'Failed to change password.';
  } finally {
    bChangingPassword.value = false;
  }
};
</script>

<template>
  <PageShell>
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-text-primary">Account</h1>
      <p class="text-sm text-text-muted mt-1">
        Change your username or password. You will stay signed in after changing username.
      </p>
    </div>

    <div class="space-y-8">
      <!-- Change username -->
      <div class="box bg-surface!">
        <h2 class="text-md font-semibold text-text-primary mb-3">Change username</h2>
        <hr />
        <p class="message is-info mb-3">Current: {{ authStore.username ?? '—' }}</p>
        <div class="field">
          <div class="label">New username</div>
          <div class="input-wrap">
            <span class="icon">
              <span class="material-symbols-outlined">person</span>
            </span>
            <input
              v-model="accountNewUsername"
              type="text"
              placeholder="New username"
              :disabled="bChangingUsername"
            />
          </div>
          <p v-if="accountUsernameError" class="hint is-error">
            {{ accountUsernameError }}
          </p>
        </div>
        <div class="flex justify-end mt-4">
          <button
            class="button is-primary"
            :disabled="bChangingUsername || !accountNewUsername.trim()"
            @click="changeUsername"
          >
            <div v-if="bChangingUsername" class="loading-spinner"></div>
            Update username
          </button>
        </div>
        <p v-if="accountUsernameSuccess" class="message is-success mt-2">Username updated.</p>
      </div>

      <!-- Change password -->
      <div class="box bg-surface!">
        <h2 class="text-md font-semibold text-text-primary mb-3">Change password</h2>
        <hr />
        <div class="field">
          <div class="label">Current password</div>
          <div class="input-wrap">
            <span class="icon">
              <span class="material-symbols-outlined">lock</span>
            </span>
            <input
              v-model="accountCurrentPassword"
              type="password"
              placeholder="Current password"
              :disabled="bChangingPassword"
            />
          </div>
        </div>
        <div class="field mt-2">
          <div class="label">New password</div>
          <div class="input-wrap">
            <span class="icon">
              <span class="material-symbols-outlined">lock</span>
            </span>
            <input
              v-model="accountNewPassword"
              type="password"
              placeholder="At least 8 characters"
              :disabled="bChangingPassword"
            />
          </div>
        </div>
        <div class="field mt-2">
          <div class="label">New password</div>
          <div class="input-wrap">
            <span class="icon">
              <span class="material-symbols-outlined">lock</span>
            </span>
            <input
              v-model="accountConfirmPassword"
              type="password"
              placeholder="Confirm new password"
              :disabled="bChangingPassword"
            />
          </div>
          <p v-if="!accountConfirmPassword" class="hint is-error">
            {{ accountPasswordError }}
          </p>
        </div>

        <div v-if="accountPasswordSuccess" class="message is-success">Password updated.</div>

        <div class="flex justify-end mt-4">
          <button
            class="button is-primary"
            :disabled="
              bChangingPassword ||
              !accountCurrentPassword ||
              !accountNewPassword ||
              !accountConfirmPassword
            "
            @click="changePassword"
          >
            <div v-if="bChangingPassword" class="loading-spinner"></div>
            Update password
          </button>
        </div>
      </div>
    </div>
  </PageShell>
</template>
