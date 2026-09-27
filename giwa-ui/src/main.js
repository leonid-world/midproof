import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'
import { applyMidnightProofDevtoolsPolicy } from './services/midnight/devtoolsPolicy'

const app = createApp(App)
applyMidnightProofDevtoolsPolicy(app)

app.use(createPinia())
app.use(router)

app.use(PrimeVue, {
  theme: {
    preset: Aura,
  },
})

app.mount('#app')
