'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  Cloud, 
  Settings, 
  RefreshCw, 
  Link as LinkIcon, 
  Mail, 
  Trash2, 
  Copy, 
  LogOut, 
  Download,
  Plus,
  UploadCloud,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  DEFAULT_BATCH_LINK_EXPIRES_DAYS,
  DEFAULT_BATCH_LINK_MAX_VIEWS,
  parseBatchShareLinkOptions,
} from '@/lib/share-link-settings';
import { findUsersByUsername, getAdminPanelVisibility, getBootstrapRequestsForRole } from '@/lib/mailbox-admin-utils';

type CharType = 'mixed' | 'number' | 'english';

type Provider = {
  id: string;
  name: string;
  domain: string;
  token: string;
  email_domain: string | null;
};

type ShareLink = {
  id: string;
  token: string;
  mailbox_email: string;
  max_views: number;
  views_used: number;
  expires_at?: string | null;
  url?: string;
};

type Mailbox = {
  id: string;
  owner_user_id: string;
  email: string;
  note?: string | null;
  group?: string | null;
  password?: string | null;
  source?: string | null;
  provider_id?: string | null;
  created_at: string;
  shareLinks?: ShareLink[];
};

type CreatedAccount = {
  email: string;
  password: string;
  mailboxId: string;
  provider: string;
  shareLink?: {
    token: string;
    url: string;
    max_views: number;
    expires_at: string | null;
  };
};

type SyncSettings = {
  enabled: boolean;
  interval_seconds: number;
};

type ApiError = {
  error?: string;
};

type CurrentUser = {
  id: string;
  username: string;
  role: 'admin' | 'user';
};

type ManagedUser = CurrentUser & {
  created_at?: string;
};

type AuthMode = 'bootstrap' | 'login';

type LoginResponse = {
  success?: boolean;
  message?: string;
  mode?: AuthMode;
  allowBootstrap?: boolean;
  currentUser?: CurrentUser | null;
} & ApiError;

type UsersResponse = {
  success: boolean;
  users: ManagedUser[];
} & ApiError;

type MailboxesResponse = {
  success: boolean;
  mailboxes: Mailbox[];
  created?: number;
  total?: number;
} & ApiError;

type ShareLinksResponse = {
  success: boolean;
  shareLinks: ShareLink[];
  url?: string;
} & ApiError;

type ProvidersResponse = {
  success: boolean;
  providers: Provider[];
  imported?: number;
  provider?: Provider;
} & ApiError;

type ProviderAccountCreateResponse = {
  success: boolean;
  created: number;
  accounts: CreatedAccount[];
} & ApiError;

type SyncSettingsResponse = {
  success: boolean;
  settings: SyncSettings;
} & ApiError;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '请求失败';
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await res.json() as T & ApiError;
  if (!res.ok) {
    throw new Error(json.error || '请求失败');
  }
  return json;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCharType(value: string): CharType {
  return value === 'number' || value === 'english' ? value : 'mixed';
}

export default function Admin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({ enabled: true, interval_seconds: 60 });
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [providerJson, setProviderJson] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [note, setNote] = useState('');
  const [group, setGroup] = useState('');
  const [batchLinkMaxViews, setBatchLinkMaxViews] = useState(DEFAULT_BATCH_LINK_MAX_VIEWS);
  const [batchLinkExpiresDays, setBatchLinkExpiresDays] = useState(DEFAULT_BATCH_LINK_EXPIRES_DAYS);
  const [queryGroup, setQueryGroup] = useState('');
  const [queryOwnerInput, setQueryOwnerInput] = useState('');
  const [queryOwnerUsername, setQueryOwnerUsername] = useState('');
  const [queryLimit, setQueryLimit] = useState(999999);
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [bulkGroupModalOpen, setBulkGroupModalOpen] = useState(false);
  const [bulkGroupInput, setBulkGroupInput] = useState('');
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [batchLinkModalOpen, setBatchLinkModalOpen] = useState(false);

  const [createCount, setCreateCount] = useState(10);
  const [createPrefix, setCreatePrefix] = useState('');
  const [createCharType, setCreateCharType] = useState<CharType>('mixed');
  const [createCharLen, setCreateCharLen] = useState(8);
  const [createMaxViews, setCreateMaxViews] = useState(0);
  const [createExpiresMin, setCreateExpiresMin] = useState(0);
  const [lastCreated, setLastCreated] = useState<CreatedAccount[]>([]);

  const [editingMailbox, setEditingMailbox] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{group: string; note: string; password: string}>({group: '', note: '', password: ''});

  const providerMap = useMemo(() => {
    const map = new Map<string, Provider>();
    providers.forEach((provider) => {
      map.set(provider.id, provider);
    });
    return map;
  }, [providers]);

  const userMap = useMemo(() => {
    const map = new Map<string, ManagedUser>();
    users.forEach((user) => {
      map.set(user.id, user);
    });
    return map;
  }, [users]);

  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    mailboxes.forEach((m) => { if (m.group) s.add(m.group); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [mailboxes]);

  const ownerSuggestions = useMemo(() => {
    if (currentUser?.role !== 'admin') return [];
    return findUsersByUsername(users, queryOwnerInput).slice(0, 8);
  }, [currentUser?.role, queryOwnerInput, users]);

  const panelVisibility = useMemo(
    () => getAdminPanelVisibility(currentUser?.role || 'user'),
    [currentUser?.role],
  );

  async function loadAll(
    overrideGroup?: string,
    overrideOwnerUsername?: string,
    roleOverride?: CurrentUser['role'],
  ) {
    const g = overrideGroup !== undefined ? overrideGroup : queryGroup;
    const ownerUsername = overrideOwnerUsername !== undefined ? overrideOwnerUsername : queryOwnerUsername;
    const role = roleOverride || currentUser?.role || 'user';
    const bootstrapRequests = getBootstrapRequestsForRole(role);
    const [mailboxRes, providerRes, syncRes] = await Promise.all([
      requestJson<MailboxesResponse>(`/api/admin/mailboxes?withLinks=1&limit=${queryLimit}${g ? `&group=${encodeURIComponent(g)}` : ''}${role === 'admin' && ownerUsername ? `&ownerUsername=${encodeURIComponent(ownerUsername)}` : ''}`),
      requestJson<ProvidersResponse>('/api/admin/providers'),
      bootstrapRequests.loadSyncSettings
        ? requestJson<SyncSettingsResponse>('/api/admin/sync-settings')
        : Promise.resolve(null),
    ]);

    setMailboxes(mailboxRes.mailboxes || []);
    setSelectedMailboxes(new Set());
    setCurrentPage(1);
    setProviders(providerRes.providers || []);
    if (syncRes?.settings) {
      setSyncSettings(syncRes.settings);
    }

    if (!selectedProviderId && providerRes.providers.length > 0) {
      setSelectedProviderId(providerRes.providers[0].id);
    }
  }

  async function loadUsers() {
    const response = await requestJson<UsersResponse>('/api/admin/users');
    setUsers(response.users || []);
  }

  async function refreshSession() {
    try {
      const response = await requestJson<LoginResponse>('/api/admin/login');
      setAuthMode(response.mode || 'login');
      setCurrentUser(response.currentUser || null);

      if (response.currentUser) {
        const bootstrapRequests = getBootstrapRequestsForRole(response.currentUser.role);
        setAuthed(true);
        await loadAll(undefined, undefined, response.currentUser.role);
        if (bootstrapRequests.loadUsers) {
          await loadUsers();
        }
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login() {
    setLoading(true);
    setMsg('');
    try {
      const response = await requestJson<LoginResponse>('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode,
          username,
          password,
        }),
      });

      setAuthMode(response.mode || 'login');
      setCurrentUser(response.currentUser || null);
      setAuthed(true);
      if (response.currentUser) {
        const bootstrapRequests = getBootstrapRequestsForRole(response.currentUser.role);
        await loadAll(undefined, undefined, response.currentUser.role);
        if (bootstrapRequests.loadUsers) {
          await loadUsers();
        }
      }
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await requestJson<{ success: boolean }>('/api/admin/login', {
        method: 'DELETE',
      });
      setAuthed(false);
      setCurrentUser(null);
      setUsers([]);
      setUsername('');
      setPassword('');
      await refreshSession();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createManagedUser() {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setLoading(true);
    setMsg('');
    try {
      await requestJson<{ success: boolean }>('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      setMsg(`用户 ${newUsername} 创建成功`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      await loadUsers();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function bulkImport() {
    if (!bulkText.trim()) return;
    setLoading(true);
    try {
      const response = await requestJson<MailboxesResponse>('/api/admin/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: bulkText, note, group, mode: 'bulk' }),
      });
      setMsg(`导入完成，新增 ${response.created || 0} 个`);
      setBulkText('');
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openBulkLinkModal() {
    if (selectedMailboxes.size === 0) return;
    setBatchLinkMaxViews(DEFAULT_BATCH_LINK_MAX_VIEWS);
    setBatchLinkExpiresDays(DEFAULT_BATCH_LINK_EXPIRES_DAYS);
    setBatchLinkModalOpen(true);
  }

  async function executeBulkCreateLink() {
    setLoading(true);
    try {
      const emailsToProcess = Array.from(selectedMailboxes);
      if (emailsToProcess.length === 0) {
        setMsg('请先选择要生成链接的邮箱');
        setLoading(false);
        return;
      }

      const linkOptions = parseBatchShareLinkOptions({
        maxViews: batchLinkMaxViews,
        expiresInDays: batchLinkExpiresDays,
      });
      await requestJson<ShareLinksResponse>('/api/admin/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailboxEmails: emailsToProcess,
          maxViews: linkOptions.maxViews,
          expiresInDays: linkOptions.expiresInDays,
        }),
      });
      setBatchLinkModalOpen(false);
      setMsg(`已为 ${emailsToProcess.length} 个邮箱生成链接，旧的剩余次数和天数已覆盖`);
      setSelectedMailboxes(new Set());
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveMailboxEdit(email: string) {
    setLoading(true);
    try {
      await requestJson<{ success: boolean; mailbox: Mailbox }>(
        '/api/admin/mailboxes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, note: editForm.note, group: editForm.group, password: editForm.password, mode: 'single' }),
        }
      );
      setMsg('更新成功');
      setEditingMailbox(null);
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openBulkGroupModal() {
    if (selectedMailboxes.size === 0) return;
    setBulkGroupInput('');
    setBulkGroupModalOpen(true);
  }

  async function executeBulkGroup() {
    setBulkGroupModalOpen(false);
    setLoading(true);
    try {
      const emails = Array.from(selectedMailboxes).join(',');
      await requestJson<{ success: boolean }>('/api/admin/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, group: bulkGroupInput, mode: 'bulk' }),
      });
      setMsg(`已更新 ${selectedMailboxes.size} 个邮箱的分组`);
      setSelectedMailboxes(new Set());
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function bulkExportCSV() {
    if (selectedMailboxes.size === 0) return;
    const selectedList = mailboxes.filter(mb => selectedMailboxes.has(mb.email));
    
    const rows = [
      ['email', 'password', 'group', 'note', 'open_url', 'max_views', 'expires_at', 'created_at'],
      ...selectedList.map((mb) => {
        const link = mb.shareLinks && mb.shareLinks.length > 0 ? mb.shareLinks[0] : null;
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        const openUrl = link ? `${base}/open/${link.token}` : '';
        return [
          mb.email,
          mb.password || '',
          mb.group || '',
          mb.note || '',
          openUrl,
          link ? String(link.max_views) : '',
          link?.expires_at || '',
          mb.created_at,
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloudmail_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openBulkDeleteModal() {
    if (selectedMailboxes.size === 0) return;
    setBulkDeleteModalOpen(true);
  }

  async function executeBulkDelete() {
    setBulkDeleteModalOpen(false);
    setLoading(true);
    try {
      const emails = Array.from(selectedMailboxes).join(',');
      await requestJson<{ success: boolean }>(`/api/admin/mailboxes?emails=${encodeURIComponent(emails)}`, {
        method: 'DELETE',
      });
      setMsg(`已删除 ${selectedMailboxes.size} 个邮箱`);
      setSelectedMailboxes(new Set());
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function deleteLink(id: string) {
    if (!confirm('删除这个访问链接？')) return;
    setLoading(true);
    try {
      await requestJson<{ success: boolean }>(`/api/admin/share-links?id=${id}`, {
        method: 'DELETE',
      });
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function deleteMailbox(email: string) {
    if (!confirm(`删除邮箱「${email}」及相关邮件和链接？`)) return;
    setLoading(true);
    try {
      await requestJson<{ success: boolean }>(`/api/admin/mailboxes?emails=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      setMsg(`已删除邮箱：${email}`);
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createProviderAccounts() {
    setLoading(true);
    setMsg('');
    setLastCreated([]);
    try {
      const response = await requestJson<ProviderAccountCreateResponse>('/api/admin/provider-accounts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: createCount,
          prefix: createPrefix,
          charType: createCharType,
          charLength: createCharLen,
          maxViews: createMaxViews,
          expiresInMinutes: createExpiresMin,
          note: note || 'provider',
          group,
          providerId: selectedProviderId || undefined,
        }),
      });

      setMsg(`云端创建成功 ${response.created} 个，已自动生成访问链接`);
      setLastCreated(response.accounts || []);
      await loadAll();
    } catch (error: unknown) {
      setMsg(`云端创建失败: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleProviderFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setProviderJson(e.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function importProvidersFromJson() {
    if (!providerJson.trim()) return;
    setLoading(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(providerJson);
      } catch {
        throw new Error('JSON 格式不正确');
      }

      const response = await requestJson<ProvidersResponse>('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      setMsg(`导入接口成功，共 ${response.imported ?? (response.provider ? 1 : 0)} 个`);
      setProviderJson('');
      await loadAll();
    } catch (error: unknown) {
      setMsg(`导入失败: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProvider(id: string, name: string) {
    if (!confirm(`删除接口「${name}」？`)) return;
    setLoading(true);
    try {
      await requestJson<{ success: boolean }>(`/api/admin/providers?id=${id}`, {
        method: 'DELETE',
      });
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateSyncEnabled(enabled: boolean) {
    setLoading(true);
    try {
      const response = await requestJson<SyncSettingsResponse>('/api/admin/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setSyncSettings(response.settings);
      setMsg(enabled ? '后台轮询已开启' : '后台轮询已关闭');
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function exportCreatedAsCSV() {
    if (lastCreated.length === 0) return;
    const rows = [
      ['email', 'password', 'open_url', 'max_views', 'expires_at'],
      ...lastCreated.map((account) => [
        account.email,
        account.password,
        account.shareLink?.url || '',
        String(account.shareLink?.max_views ?? ''),
        account.shareLink?.expires_at || '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloudmail_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyAllLinks() {
    if (lastCreated.length === 0) return;
    const text = lastCreated
      .map((account) => `${account.email}\t${account.password}\t${account.shareLink?.url || ''}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('已复制 邮箱 + 密码 + 链接（制表分隔）');
    });
  }

  const totalPages = Math.ceil(mailboxes.length / pageSize) || 1;
  const validCurrentPage = clamp(currentPage, 1, totalPages);
  const paginatedMailboxes = mailboxes.slice((validCurrentPage - 1) * pageSize, validCurrentPage * pageSize);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center text-emerald-600 mb-4">
            <Cloud className="w-12 h-12" />
          </div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            CloudMail 管理后台
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            开放链接 & 批量管理
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void login(); }}>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  用户名
                </label>
                <div className="mt-2">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={authMode === 'bootstrap' ? '首个管理员用户名' : '请输入用户名'}
                    className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  密码
                </label>
                <div className="mt-2">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={authMode === 'bootstrap' ? '设置管理员密码' : '请输入密码'}
                    className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 transition-colors"
                >
                  {loading ? '提交中...' : authMode === 'bootstrap' ? '初始化管理员' : '登录'}
                </button>
              </div>
            </form>
            
            {msg && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {msg}
              </div>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-gray-500">
            {authMode === 'bootstrap' ? '首次进入请先创建管理员，创建后将关闭游客注册。' : '仅已创建用户可登录后台。'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm shadow-gray-100/50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
              <Cloud className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">CloudMail 管理后台</h1>
          </div>
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="text-sm text-gray-500">
                {currentUser.username} / {currentUser.role === 'admin' ? '管理员' : '用户'}
              </div>
            )}
            <button
              onClick={() => void logout()}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Global Message Alert */}
        {msg && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl shadow-sm flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
            {msg}
          </div>
        )}

        {currentUser?.role === 'admin' && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">用户管理</h2>
                <p className="text-sm text-gray-500 mt-1">只有管理员可以创建新用户；游客注册已关闭。</p>
              </div>
              <div className="text-sm text-gray-500">共 {users.length} 个用户</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="用户名" className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="密码" type="password" className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value === 'admin' ? 'admin' : 'user')} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
              <button onClick={() => void createManagedUser()} disabled={loading} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                创建用户
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {users.map((user) => (
                <span key={user.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-sm text-gray-700">
                  {user.username}
                  <span className="text-xs text-gray-500">({user.role === 'admin' ? '管理员' : '用户'})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Sync & Providers */}
          <div className="space-y-8 lg:col-span-1">
            
            {/* Sync Settings */}
            {panelVisibility.showSyncSettings && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                    <h2 className="font-semibold text-gray-800">后台自动同步</h2>
                  </div>
                  <button 
                    role="switch" 
                    aria-checked={syncSettings.enabled}
                    onClick={() => void updateSyncEnabled(!syncSettings.enabled)}
                    className={`${syncSettings.enabled ? 'bg-emerald-500' : 'bg-gray-200'} relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2`}
                  >
                    <span className={`${syncSettings.enabled ? 'translate-x-4' : 'translate-x-0'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                  </button>
                </div>
                <div className="p-5 text-sm text-gray-600 leading-relaxed">
                  默认开启；服务端会每 <span className="font-medium text-gray-900">{syncSettings.interval_seconds}</span> 秒轮询一次所有已绑定 provider 的邮箱并写入本地库。
                </div>
              </section>
            )}

            {/* Providers */}
            {panelVisibility.showProviderManagement && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <h2 className="font-semibold text-gray-800">邮箱接口管理</h2>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-gray-500">
                    支持配置多个上游接口，请选择 JSON 文件导入。
                  </p>
                  {providerJson && (
                    <div className="text-xs text-emerald-600 font-medium">
                      已加载 JSON 数据，准备导入。
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                      <UploadCloud className="w-3.5 h-3.5" />
                      选择 JSON 文件
                      <input type="file" accept=".json" onChange={handleProviderFileUpload} className="hidden" />
                    </label>
                    <button 
                      onClick={() => void importProvidersFromJson()} 
                      disabled={loading || !providerJson}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      确认导入
                    </button>
                    <button 
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(providers, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `cloudmail-configs-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                    >
                      导出配置
                    </button>
                  </div>

                  {providers.length > 0 && (
                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      {providers.map((p) => (
                        <div key={p.id} className="group flex items-center justify-between p-2.5 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                            <div className="text-xs text-gray-500 truncate">{p.domain}</div>
                          </div>
                          <button 
                            onClick={() => void deleteProvider(p.id, p.name)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
            {/* Cloud Creation (Primary Action) */}
            {panelVisibility.showProviderAccountCreation && (
              <section className="bg-gradient-to-br from-emerald-50 to-teal-50/30 rounded-2xl border border-emerald-100 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                  <Cloud className="w-32 h-32 text-emerald-600" />
                </div>
                <div className="px-6 py-5 border-b border-emerald-100/50 relative z-10">
                  <h2 className="font-bold text-emerald-900 text-lg flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-emerald-600" />
                    云端创建与一键生成链接
                  </h2>
                  <p className="text-sm text-emerald-700/80 mt-1">
                    直接调用上游 API 批量创建真实邮箱 + 自动落库 + 自动生成访问链接。
                  </p>
                </div>
                <div className="p-6 relative z-10">
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">选择接口</label>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => setSelectedProviderId(e.target.value)}
                        className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">(使用环境变量默认接口)</option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} — {p.domain}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">数量</label>
                      <input type="number" value={createCount} onChange={(e) => setCreateCount(clamp(Number(e.target.value), 1, 100))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">前缀</label>
                      <input value={createPrefix} onChange={(e) => setCreatePrefix(e.target.value)} placeholder="可选" className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">分组</label>
                      <div className="flex gap-2">
                        <select
                          value={availableGroups.includes(group) ? group : ''}
                          onChange={(e) => { if (e.target.value) setGroup(e.target.value); }}
                          className="px-2 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">自定义</option>
                          {availableGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="分组(可选)" className="flex-1 px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">类型</label>
                      <select value={createCharType} onChange={(e) => setCreateCharType(normalizeCharType(e.target.value))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="mixed">混合(Mixed)</option>
                        <option value="number">数字(Number)</option>
                        <option value="english">英文(English)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">长度</label>
                      <input type="number" value={createCharLen} onChange={(e) => setCreateCharLen(clamp(Number(e.target.value), 4, 20))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">最大查看次数(0=无限)</label>
                      <input type="number" value={createMaxViews} onChange={(e) => setCreateMaxViews(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-800 mb-1.5">有效期(分钟, 0=无限)</label>
                      <input type="number" value={createExpiresMin} onChange={(e) => setCreateExpiresMin(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="col-span-2 flex justify-end mt-2">
                      <button 
                        onClick={() => void createProviderAccounts()} 
                        disabled={loading} 
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {loading ? '创建中...' : '创建并生成链接'}
                      </button>
                    </div>
                  </div>

                  {lastCreated.length > 0 && (
                    <div className="mt-6 bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-emerald-50/50 border-b border-emerald-100 flex flex-col gap-2">
                        <span className="text-sm font-semibold text-emerald-900">本次创建结果 ({lastCreated.length})</span>
                        <div className="flex gap-2">
                          <button onClick={copyAllLinks} className="flex-1 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100/50 hover:bg-emerald-100 rounded-md transition-colors flex items-center justify-center gap-1.5">
                            <Copy className="w-3.5 h-3.5" /> 复制全部
                          </button>
                          <button onClick={exportCreatedAsCSV} className="flex-1 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center justify-center gap-1.5">
                            <Download className="w-3.5 h-3.5" /> 导出 CSV
                          </button>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                          <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider sticky top-0 backdrop-blur-md">
                            <tr>
                              <th className="px-4 py-2 font-medium">邮箱</th>
                              <th className="px-4 py-2 font-medium">密码</th>
                              <th className="px-4 py-2 font-medium">访问链接</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 bg-white">
                            {lastCreated.map((acc, i) => (
                              <tr key={`${acc.email}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-2 font-mono text-xs text-gray-900">{acc.email}</td>
                                <td className="px-4 py-2 font-mono text-xs text-gray-600 flex items-center gap-2">
                                  {acc.password}
                                  <button onClick={() => navigator.clipboard.writeText(acc.password)} className="text-gray-400 hover:text-gray-700"><Copy className="w-3 h-3" /></button>
                                </td>
                                <td className="px-4 py-2">
                                  <a href={acc.shareLink?.url || '#'} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium text-xs flex items-center gap-1">
                                    {acc.shareLink?.url ? '打开' : ''}
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Main Operations */}
          <div className="space-y-8 lg:col-span-2">
            
            {/* Bulk Import */}
            <section id="bulk-import-section" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                <UploadCloud className="w-4 h-4 text-gray-500" />
                批量导入
              </h2>
              <div className="space-y-3">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="user01@mail-provider.example&#10;user02@mail-provider.example"
                  className="w-full h-24 font-mono text-xs p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none transition-colors"
                />
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[140px] flex gap-1.5">
                    <select
                      value={availableGroups.includes(group) ? group : ''}
                      onChange={(e) => { if (e.target.value) setGroup(e.target.value); }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="">自定义</option>
                      {availableGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="分组(可选)" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" />
                  </div>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="标题/备注 (可选)" className="flex-1 min-w-[120px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" />
                  <button onClick={() => void bulkImport()} disabled={loading} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                    导入
                  </button>
                </div>
              </div>
            </section>

            {/* Mailboxes List */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50/50">
                <div className="flex items-center gap-3 shrink-0">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    邮箱列表管理 ({mailboxes.length})
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {currentUser?.role === 'admin' && (
                    <div className="relative">
                      <input
                        value={queryOwnerInput}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setQueryOwnerInput(nextValue);
                          if (!nextValue.trim()) {
                            setQueryOwnerUsername('');
                            void loadAll(queryGroup, '');
                          } else if (queryOwnerUsername !== nextValue.trim().toLowerCase()) {
                            setQueryOwnerUsername('');
                          }
                        }}
                        placeholder="搜索用户名字"
                        className="w-40 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {queryOwnerInput.trim() && queryOwnerUsername !== queryOwnerInput.trim().toLowerCase() && ownerSuggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                          {ownerSuggestions.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => {
                                setQueryOwnerInput(user.username);
                                setQueryOwnerUsername(user.username);
                                void loadAll(queryGroup, user.username);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-emerald-50"
                            >
                              {user.username}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <select
                    value={queryGroup}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQueryGroup(v);
                      void loadAll(v);
                    }}
                    className="w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">所有分组</option>
                    {availableGroups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <select 
                    value={queryLimit} 
                    onChange={(e) => setQueryLimit(Number(e.target.value))}
                    className="w-28 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={100}>100条</option>
                    <option value={500}>500条</option>
                    <option value={1000}>1000条</option>
                    <option value={5000}>5000条</option>
                    <option value={999999}>全部邮箱</option>
                  </select>
                  <button onClick={() => void loadAll()} className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors">
                    查询
                  </button>
                </div>
              </div>
              
              {/* Bulk Actions Bar */}
              {selectedMailboxes.size > 0 && (
                <div className="px-6 py-3 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-sm font-medium text-emerald-800">
                    已选择 {selectedMailboxes.size} 项
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openBulkDeleteModal()} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      批量删除
                    </button>
                    <button onClick={() => openBulkGroupModal()} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      批量编辑分组
                    </button>
                    <button onClick={openBulkLinkModal} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" />
                      批量生成链接
                    </button>
                    <button onClick={bulkExportCSV} className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      批量导出CSV
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto min-h-[650px]">
                {mailboxes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">暂无匹配的邮箱</div>
                ) : (
                  <table className="min-w-full text-sm divide-y divide-gray-100">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                        <th className="w-8 px-3 py-2">
                          <input 
                            type="checkbox" 
                            checked={selectedMailboxes.size > 0 && paginatedMailboxes.every(m => selectedMailboxes.has(m.email))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newSet = new Set(selectedMailboxes);
                                paginatedMailboxes.forEach(m => newSet.add(m.email));
                                setSelectedMailboxes(newSet);
                              } else {
                                const newSet = new Set(selectedMailboxes);
                                paginatedMailboxes.forEach(m => newSet.delete(m.email));
                                setSelectedMailboxes(newSet);
                              }
                            }}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                        </th>
                        <th className="px-3 py-2 font-medium">序号</th>
                        <th className="px-3 py-2 font-medium">邮箱</th>
                        <th className="px-3 py-2 font-medium">分组</th>
                        <th className="px-3 py-2 font-medium">公开链接</th>
                        <th className="px-3 py-2 font-medium">API</th>
                        <th className="px-3 py-2 font-medium">到期时间</th>
                        <th className="px-3 py-2 font-medium">剩余次数</th>
                        <th className="px-3 py-2 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {paginatedMailboxes.map((mb, index) => {
                        const link = mb.shareLinks && mb.shareLinks.length > 0 ? mb.shareLinks[0] : null;
                        const absoluteIndex = (validCurrentPage - 1) * pageSize + index + 1;
                        const base = typeof window !== 'undefined' ? window.location.origin : '';
                        const openUrl = link ? `${base}/open/${link.token}` : '';
                        const apiUrl = link ? `${base}/api/open/${link.token}?format=json` : '';
                        const remain = link ? (link.max_views > 0 ? Math.max(0, link.max_views - (link.views_used || 0)) : '∞') : '-';
                        const expire = link?.expires_at ? new Date(link.expires_at).toLocaleDateString('zh-CN') : (link ? '永不过期' : '-');
                        const ownerName = currentUser?.role === 'admin' ? userMap.get(mb.owner_user_id)?.username : '';

                        if (editingMailbox === mb.email) {
                          return (
                            <tr key={mb.id} className="bg-emerald-50/40">
                              <td className="px-3 py-3 align-top" colSpan={9}>
                                <div className="flex flex-col gap-2">
                                  <div className="font-mono text-sm font-medium text-gray-900">{mb.email}</div>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div className="flex gap-1">
                                      <select
                                        value={availableGroups.includes(editForm.group) ? editForm.group : ''}
                                        onChange={(e) => { if (e.target.value) setEditForm({ ...editForm, group: e.target.value }); }}
                                        className="px-1.5 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                                      >
                                        <option value="">自定义</option>
                                        {availableGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                      <input value={editForm.group} onChange={(e) => setEditForm({ ...editForm, group: e.target.value })} placeholder="分组" className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none" />
                                    </div>
                                    <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} placeholder="标题" className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none" />
                                    <input value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="密码" className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none" />
                                  </div>
                                  <div className="flex justify-end gap-2 mt-1">
                                    <button onClick={() => setEditingMailbox(null)} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors">取消</button>
                                    <button onClick={() => void saveMailboxEdit(mb.email)} disabled={loading} className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors">保存</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={mb.id} className="hover:bg-gray-50/60 align-top">
                            <td className="px-3 py-3 w-8">
                              <input 
                                type="checkbox" 
                                checked={selectedMailboxes.has(mb.email)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedMailboxes);
                                  if (e.target.checked) newSet.add(mb.email);
                                  else newSet.delete(mb.email);
                                  setSelectedMailboxes(newSet);
                                }}
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                              />
                            </td>
                            <td className="px-3 py-3 text-gray-700 text-xs font-mono">
                              {absoluteIndex}
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-mono text-sm text-gray-900 flex items-center gap-1.5 flex-wrap">
                                {mb.email}
                                {mb.source === 'provider' && <span className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-700">provider</span>}
                                {mb.provider_id && providerMap.get(mb.provider_id) && (
                                  <span className="px-1 py-0.5 rounded text-[9px] bg-gray-100 text-gray-600">{providerMap.get(mb.provider_id)?.name}</span>
                                )}
                                {mb.password && <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700">密码</span>}
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">{new Date(mb.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td className="px-3 py-3">
                              {mb.group ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">[{mb.group}]</span> : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-3">
                              {openUrl ? (
                                <div className="flex items-center gap-1 text-xs max-w-[220px]">
                                  <a href={openUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline truncate" title={openUrl}>{openUrl.replace(/^https?:\/\//, '')}</a>
                                  <button onClick={() => navigator.clipboard.writeText(openUrl)} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded" title="复制公开链接"><Copy className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => void deleteLink(link!.id)} className="p-0.5 text-red-500 hover:bg-red-100 rounded" title="删除链接"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-gray-400">无</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {apiUrl ? (
                                <div className="flex items-center gap-1 text-xs">
                                  <a href={apiUrl} target="_blank" rel="noreferrer" className="text-gray-600 hover:text-gray-900 underline decoration-dotted">JSON</a>
                                  <button onClick={() => navigator.clipboard.writeText(apiUrl)} className="p-0.5 text-gray-500 hover:bg-gray-100 rounded" title="复制 API"><Copy className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{expire}</td>
                            <td className="px-3 py-3 text-xs text-gray-700 whitespace-nowrap">
                              <div>
                                {typeof remain === 'number' ? `${remain} / ${link?.max_views}` : remain}
                                {link && link.max_views > 0 && <span className="text-gray-400 ml-1">({link.views_used}已用)</span>}
                              </div>
                              {ownerName && (
                                <div className="mt-0.5 text-[10px] text-gray-400">
                                  账号：{ownerName}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <button 
                                  onClick={() => {
                                    setEditForm({ group: mb.group || '', note: mb.note || '', password: mb.password || '' });
                                    setEditingMailbox(mb.email);
                                  }} 
                                  className="px-2 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                                >
                                  编辑
                                </button>
                                {mb.password && (
                                  <button onClick={() => navigator.clipboard.writeText(mb.password ?? '')} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded" title="复制密码">
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => void deleteMailbox(mb.email)} className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors whitespace-nowrap">
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              
              {mailboxes.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    共 {mailboxes.length} 条记录，当前显示第 {(validCurrentPage - 1) * pageSize + 1} 到 {Math.min(validCurrentPage * pageSize, mailboxes.length)} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value={20}>20条/页</option>
                      <option value={50}>50条/页</option>
                      <option value={100}>100条/页</option>
                    </select>
                    <button
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-gray-600 px-2">
                      {validCurrentPage} / {totalPages}
                    </span>
                    <button
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Modals */}
      {bulkGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">批量编辑分组</h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                为选中的 <span className="font-bold text-emerald-600">{selectedMailboxes.size}</span> 个邮箱设置新分组名称
              </label>
              <input
                autoFocus
                value={bulkGroupInput}
                onChange={(e) => setBulkGroupInput(e.target.value)}
                placeholder="留空表示清除分组"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setBulkGroupModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => void executeBulkGroup()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-red-50/50">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold text-gray-900">确认批量删除</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600">
                确定要删除选中的 <span className="font-bold text-red-600">{selectedMailboxes.size}</span> 个邮箱及相关邮件和链接吗？此操作无法恢复。
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => void executeBulkDelete()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {batchLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-50/50">
              <h3 className="font-semibold text-gray-900">批量生成链接</h3>
              <span className="text-xs text-emerald-700">默认 100 次 / 30 天</span>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                将为选中的 <span className="font-bold text-emerald-600">{selectedMailboxes.size}</span> 个邮箱重新生成链接。
                如果已有剩余次数和剩余天数，会直接覆盖为新的设置。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">次数</label>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={batchLinkMaxViews}
                  onChange={(e) => setBatchLinkMaxViews(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-400">0 表示不限次数</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">剩余天数</label>
                <input
                  type="number"
                  min={0}
                  value={batchLinkExpiresDays}
                  onChange={(e) => setBatchLinkExpiresDays(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-400">0 表示永不过期</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setBatchLinkModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => void executeBulkCreateLink()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
