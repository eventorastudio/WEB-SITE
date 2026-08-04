import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initSettingsModule } from './modules/settings/settings-module.js';

initAdminShell({
    requiredPermission: PERMISSIONS.SETTINGS_VIEW,
    onReady: initSettingsModule
});
