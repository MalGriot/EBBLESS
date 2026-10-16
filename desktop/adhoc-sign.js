// No Developer ID yet: ad-hoc sign so Apple Silicon doesn't call the app "damaged".
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '-s', '-', app], { stdio: 'inherit' });
};
