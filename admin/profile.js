import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initThemeManager } from './core/theme-manager.js';
import { initProfileModule } from './modules/profile/profile-module.js';

initThemeManager();

initAdminShell({
    requiredPermission: PERMISSIONS.PROFILE_VIEW,
    onReady: initProfileModule
});
