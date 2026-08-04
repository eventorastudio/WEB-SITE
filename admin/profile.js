import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initProfileModule } from './modules/profile/profile-module.js';

initAdminShell({
    requiredPermission: PERMISSIONS.PROFILE_VIEW,
    onReady: initProfileModule
});
