import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCXY7EV89zW_4voYql7IYZsU_Cyh0HcY68',
    authDomain: 'eventorastudio-d6d95.firebaseapp.com',
    projectId: 'eventorastudio-d6d95',
    storageBucket: 'eventorastudio-d6d95.firebasestorage.app',
    messagingSenderId: '485518462661',
    appId: '1:485518462661:web:3902d536f6a2a11184aaac'
};

const app = initializeApp(firebaseConfig);
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lef0W8tAAAAADATSwjyK6zGEbj2887wbeaXuPgJ'),
    isTokenAutoRefreshEnabled: true
});
const auth = getAuth(app);

export { app, appCheck, auth };
