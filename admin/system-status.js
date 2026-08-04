import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initThemeManager } from './core/theme-manager.js';
import { initSystemStatusModule } from './modules/system/system-status-module.js';

initThemeManager();

initAdminShell({
    requiredPermission: PERMISSIONS.SYSTEM_STATUS_VIEW,
    onReady: initSystemStatusModule
});
