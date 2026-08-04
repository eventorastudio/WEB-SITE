import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initSystemStatusModule } from './modules/system/system-status-module.js';

initAdminShell({
    requiredPermission: PERMISSIONS.SYSTEM_STATUS_VIEW,
    onReady: initSystemStatusModule
});
