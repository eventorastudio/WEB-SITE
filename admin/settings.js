import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initThemeManager } from './core/theme-manager.js';
import { initSettingsModule } from './modules/settings/settings-module.js';

initThemeManager();

initAdminShell({
    requiredPermission: PERMISSIONS.SETTINGS_VIEW,
    onReady: initSettingsModule
});
