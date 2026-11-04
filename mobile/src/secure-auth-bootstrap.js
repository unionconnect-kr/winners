import {registerPlugin} from '@capacitor/core';
import {createSecureAuthStorage} from './secure-auth-storage.mjs';
const vault=registerPlugin('ManeeSecureAuth');
window.MANEE_SECURE_STORAGE=createSecureAuthStorage({vault,projectRef:window.MANEE_CONFIG.projectRef,
 localStorage:window.localStorage,sessionStorage:window.sessionStorage});
