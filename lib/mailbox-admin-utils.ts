type UsernameLike = {
  id: string;
  username: string;
};

type UserRole = 'admin' | 'user';

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

export function findUsersByUsername<T extends UsernameLike>(users: T[], keyword: string): T[] {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];

  return [...users]
    .filter((user) => normalizeKeyword(user.username).includes(normalized))
    .sort((left, right) => {
      const leftName = normalizeKeyword(left.username);
      const rightName = normalizeKeyword(right.username);
      const leftStarts = leftName.startsWith(normalized);
      const rightStarts = rightName.startsWith(normalized);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return leftName.localeCompare(rightName, 'zh-CN');
    });
}

export function getMailboxLinkKey(ownerUserId: string | null | undefined, mailboxEmail: string) {
  return `${String(ownerUserId || '').trim()}::${mailboxEmail.trim().toLowerCase()}`;
}

export function getBootstrapRequestsForRole(role: UserRole) {
  const isAdmin = role === 'admin';

  return {
    loadUsers: isAdmin,
    loadSyncSettings: isAdmin,
  };
}

export function getAdminPanelVisibility(role: UserRole) {
  const isAdmin = role === 'admin';

  return {
    showSyncSettings: isAdmin,
    showProviderManagement: isAdmin,
    showProviderAccountCreation: isAdmin,
    showSingleMailboxCreation: false,
  };
}
