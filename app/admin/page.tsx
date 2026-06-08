'use client';

import { useMemo, useState } from 'react';
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

type LoginResponse = {
  success?: boolean;
  message?: string;
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

type DynmslCreateResponse = {
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
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({ enabled: true, interval_seconds: 60 });
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [providerJson, setProviderJson] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [singleEmail, setSingleEmail] = useState('');
  const [note, setNote] = useState('');
  const [group, setGroup] = useState('');
  const [maxViews, setMaxViews] = useState(0);
  const [expiresMin, setExpiresMin] = useState(0);
  const [queryGroup, setQueryGroup] = useState('');
  const [queryLimit, setQueryLimit] = useState(1000);
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(new Set());

  const [dynCount, setDynCount] = useState(10);
  const [dynPrefix, setDynPrefix] = useState('');
  const [dynCharType, setDynCharType] = useState<CharType>('mixed');
  const [dynCharLen, setDynCharLen] = useState(8);
  const [dynMaxViews, setDynMaxViews] = useState(0);
  const [dynExpiresMin, setDynExpiresMin] = useState(0);
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

  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    mailboxes.forEach((m) => { if (m.group) s.add(m.group); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [mailboxes]);

  async function loadAll(overrideGroup?: string) {
    const g = overrideGroup !== undefined ? overrideGroup : queryGroup;
    const [mailboxRes, providerRes, syncRes] = await Promise.all([
      requestJson<MailboxesResponse>(`/api/admin/mailboxes?withLinks=1&limit=${queryLimit}${g ? `&group=${encodeURIComponent(g)}` : ''}`),
      requestJson<ProvidersResponse>('/api/admin/providers'),
      requestJson<SyncSettingsResponse>('/api/admin/sync-settings'),
    ]);

    setMailboxes(mailboxRes.mailboxes || []);
    setSelectedMailboxes(new Set());
    setProviders(providerRes.providers || []);
    setSyncSettings(syncRes.settings);

    if (!selectedProviderId && providerRes.providers.length > 0) {
      setSelectedProviderId(providerRes.providers[0].id);
    }
  }

  async function login() {
    setLoading(true);
    setMsg('');
    try {
      await requestJson<LoginResponse>('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setAuthed(true);
      await loadAll();
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

  async function addSingle() {
    if (!singleEmail.trim()) return;
    setLoading(true);
    try {
      await requestJson<{ success: boolean; mailbox: Mailbox }>(
        '/api/admin/mailboxes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: singleEmail, note, group, mode: 'single' }),
        }
      );
      setMsg('添加成功');
      setSingleEmail('');
      await loadAll();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createLink(mailboxEmail?: string) {
    setLoading(true);
    try {
      const emailsToProcess = mailboxEmail ? [mailboxEmail] : Array.from(selectedMailboxes);
      if (emailsToProcess.length === 0) {
        setMsg('请先选择要生成链接的邮箱');
        setLoading(false);
        return;
      }

      const response = await requestJson<ShareLinksResponse>('/api/admin/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailboxEmails: emailsToProcess,
          maxViews: Number(maxViews) || 0,
          expiresInMinutes: Number(expiresMin) || 0,
        }),
      });
      if (response.url && emailsToProcess.length === 1) {
        navigator.clipboard?.writeText(response.url).catch(() => {});
        setMsg(`链接已生成：${response.url || ''}`);
      } else {
        setMsg(`已为 ${emailsToProcess.length} 个邮箱生成链接`);
      }
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

  async function bulkEditGroup() {
    if (selectedMailboxes.size === 0) return;
    const newGroup = prompt(`请输入为选中的 ${selectedMailboxes.size} 个邮箱设置的新分组名称：\n(留空表示清除分组)`);
    if (newGroup === null) return; // User cancelled
    
    setLoading(true);
    try {
      const emails = Array.from(selectedMailboxes).join(',');
      await requestJson<{ success: boolean }>('/api/admin/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, group: newGroup, mode: 'bulk' }),
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

  async function bulkDeleteMailboxes() {
    if (selectedMailboxes.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedMailboxes.size} 个邮箱及相关邮件和链接吗？`)) return;
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

  async function createFromDynmsl() {
    setLoading(true);
    setMsg('');
    setLastCreated([]);
    try {
      const response = await requestJson<DynmslCreateResponse>('/api/admin/dynmsl/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: dynCount,
          prefix: dynPrefix,
          charType: dynCharType,
          charLength: dynCharLen,
          maxViews: dynMaxViews,
          expiresInMinutes: dynExpiresMin,
          note: note || 'dynmsl',
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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  管理员密码
                </label>
                <div className="mt-2">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="若未设置密码请留空"
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
                  {loading ? '登录中...' : '登录'}
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
            首次使用请将 .env.example 复制为 .env.local 并配置密码和提供商信息。
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
          <button
            onClick={() => {
              document.cookie = 'cm_admin=; Max-Age=0; path=/';
              location.reload();
            }}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Sync & Providers */}
          <div className="space-y-8 lg:col-span-1">
            
            {/* Sync Settings */}
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

            {/* Providers */}
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
            {/* Cloud Creation (Primary Action) */}
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
                    <input type="number" value={dynCount} onChange={(e) => setDynCount(clamp(Number(e.target.value), 1, 100))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-800 mb-1.5">前缀</label>
                    <input value={dynPrefix} onChange={(e) => setDynPrefix(e.target.value)} placeholder="可选" className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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
                    <select value={dynCharType} onChange={(e) => setDynCharType(normalizeCharType(e.target.value))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="mixed">混合(Mixed)</option>
                      <option value="number">数字(Number)</option>
                      <option value="english">英文(English)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-800 mb-1.5">长度</label>
                    <input type="number" value={dynCharLen} onChange={(e) => setDynCharLen(clamp(Number(e.target.value), 4, 20))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-800 mb-1.5">最大查看次数(0=无限)</label>
                    <input type="number" value={dynMaxViews} onChange={(e) => setDynMaxViews(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-800 mb-1.5">有效期(分钟, 0=无限)</label>
                    <input type="number" value={dynExpiresMin} onChange={(e) => setDynExpiresMin(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 bg-white/80 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="col-span-2 flex justify-end mt-2">
                    <button 
                      onClick={() => void createFromDynmsl()} 
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

            {/* Single Add */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                <Mail className="w-4 h-4 text-gray-500" />
                添加单个邮箱
              </h2>
              <div className="space-y-3">
                <input value={singleEmail} onChange={(e) => setSingleEmail(e.target.value)} placeholder="email@domain.com" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex gap-1.5">
                    <select
                      value={availableGroups.includes(group) ? group : ''}
                      onChange={(e) => { if (e.target.value) setGroup(e.target.value); }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                      title="选择已有分组"
                    >
                      <option value="">自定义</option>
                      {availableGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="分组(可选)" className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" title="分组" />
                  </div>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="标题/备注 (可选)" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" title="标题/备注" />
                  <input type="number" value={maxViews} onChange={(e) => setMaxViews(Number(e.target.value))} placeholder="最大查看次数 (0=无限)" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" title="最大查看次数" />
                  <input type="number" value={expiresMin} onChange={(e) => setExpiresMin(Number(e.target.value))} placeholder="有效期(分钟, 0=无限)" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors" title="有效期分钟" />
                </div>
                <button onClick={() => void addSingle()} disabled={loading} className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-lg transition-colors">
                  添加邮箱
                </button>
              </div>
            </section>
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
                  placeholder="kukaxsmx@dynmsl.com&#10;abc123@dynmsl.com"
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
                    <button onClick={() => void bulkDeleteMailboxes()} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      批量删除
                    </button>
                    <button onClick={() => void bulkEditGroup()} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      批量编辑分组
                    </button>
                    <button onClick={() => void createLink()} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
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

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                {mailboxes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">暂无匹配的邮箱</div>
                ) : (
                  <table className="min-w-full text-sm divide-y divide-gray-100">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                        <th className="w-8 px-3 py-2">
                          <input 
                            type="checkbox" 
                            checked={selectedMailboxes.size === mailboxes.length && mailboxes.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMailboxes(new Set(mailboxes.map(m => m.email)));
                              } else {
                                setSelectedMailboxes(new Set());
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
                      {mailboxes.map((mb, index) => {
                        const link = mb.shareLinks && mb.shareLinks.length > 0 ? mb.shareLinks[0] : null;
                        const base = typeof window !== 'undefined' ? window.location.origin : '';
                        const openUrl = link ? `${base}/open/${link.token}` : '';
                        const apiUrl = link ? `${base}/api/open/${link.token}?format=json` : '';
                        const remain = link ? (link.max_views > 0 ? Math.max(0, link.max_views - (link.views_used || 0)) : '∞') : '-';
                        const expire = link?.expires_at ? new Date(link.expires_at).toLocaleDateString('zh-CN') : (link ? '永不过期' : '-');

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
                              {index + 1}
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-mono text-sm text-gray-900 flex items-center gap-1.5 flex-wrap">
                                {mb.email}
                                {mb.source === 'dynmsl' && <span className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-700">dynmsl</span>}
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
                              {typeof remain === 'number' ? `${remain} / ${link?.max_views}` : remain}
                              {link && link.max_views > 0 && <span className="text-gray-400 ml-1">({link.views_used}已用)</span>}
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
                                <button onClick={() => void createLink(mb.email)} className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors whitespace-nowrap">
                                  生成链接
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
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
