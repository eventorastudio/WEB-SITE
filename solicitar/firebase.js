import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';

const app = initializeApp({
  apiKey: 'AIzaSyCXY7EV89zW_4voYql7IYZsU_Cyh0HcY68',
  authDomain: 'eventorastudio-d6d95.firebaseapp.com',
  projectId: 'eventorastudio-d6d95',
  storageBucket: 'eventorastudio-d6d95.firebasestorage.app',
  messagingSenderId: '485518462661',
  appId: '1:485518462661:web:3902d536f6a2a11184aaac'
});

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6Lef0W8tAAAAADATSwjyK6zGEbj2887wbeaXuPgJ'),
  isTokenAutoRefreshEnabled: true
});
