import { initializeApp } from 'firebase-admin/app';

import { submitWebsiteRequest as submitWebsiteRequestHandler } from './src/submit-website-request.js';
import { deleteWebsiteRequest, getWebsiteRequests, updateWebsiteRequestStatus } from './src/admin-website-requests.js';
import { addProjectUpdate, createProject, deleteProject, getProject, getProjectUpdates, getProjects, registerMaintenanceActivity, updateProject } from './src/projects.js';

initializeApp();

export const submitWebsiteRequest = submitWebsiteRequestHandler;
export { deleteWebsiteRequest, getWebsiteRequests, updateWebsiteRequestStatus };
export { addProjectUpdate, createProject, deleteProject, getProject, getProjectUpdates, getProjects, registerMaintenanceActivity, updateProject };
