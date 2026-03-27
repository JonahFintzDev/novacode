// node_modules
import { createApp } from 'vue';
import { createPinia } from 'pinia';

// components
import App from '@/App.vue';

// classes
import router from '@/classes/router';

import '@/assets/css/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
