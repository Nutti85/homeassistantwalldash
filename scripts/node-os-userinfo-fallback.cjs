const os = require('node:os');

try {
  os.userInfo();
} catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR' || error?.syscall !== 'uv_os_get_passwd') throw error;

  const username = process.env.USERNAME || process.env.USER || 'local-user';
  const homedir = process.env.USERPROFILE || process.env.HOME || process.cwd();
  const shell = process.env.ComSpec || process.env.SHELL || null;
  os.userInfo = () => ({ username, uid: -1, gid: -1, shell, homedir });
}
