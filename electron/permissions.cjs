const networkPermissions = new Set(['local-network', 'local-network-access', 'loopback-network']);
function trustedInterfacePermission(contents, permission, origin, interfaceURL) {
  if (!networkPermissions.has(permission) || !contents) return false;
  try { return new URL(origin || contents.getURL()).origin === interfaceURL && new URL(contents.getURL()).origin === interfaceURL; }
  catch { return false; }
}
module.exports = { networkPermissions, trustedInterfacePermission };
