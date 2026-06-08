'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { normalizeOpenData, type OpenData, type RawOpenData } from '@/lib/open-mail';
import { 
  Inbox, 
  Clock, 
  Eye, 
  Link as LinkIcon, 
  AlertCircle, 
  Loader2,
  FileCode2,
  User,
  Calendar,
  ChevronRight
} from 'lucide-react';

type FullEmail = {
  id: string;
  mailbox_email: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  received_at: string;
  raw: string | null;
};

type ReceivedResponse = {
  email: FullEmail;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '加载失败';
}

export default function OpenViewer() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const asJson = search.get('format') === 'json' || search.get('type') === 'json';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpenData | null>(null);
  const [selected, setSelected] = useState<FullEmail | null>(null);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/open/${token}?format=json`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const json = normalizeOpenData(await response.json() as RawOpenData);
        if (active) {
          setData(json);
          setError(null);
        }
      } catch (loadError: unknown) {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  async function loadFull(id: string) {
    try {
      const r = await fetch(`/api/received/${id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json() as ReceivedResponse;
      setSelected(j.email);
    } catch (loadError: unknown) {
      alert(`加载邮件详情失败: ${getErrorMessage(loadError)}`);
    }
  }

  // Auto-load the latest (and only) email full content
  useEffect(() => {
    if (data && data.emails.length > 0 && !selected) {
      const firstId = data.emails[0].id;
      fetch(`/api/received/${firstId}`, { cache: 'no-store' })
        .then(r => {
          if (!r.ok) throw new Error('Failed to load');
          return r.json();
        })
        .then(j => setSelected((j as ReceivedResponse).email))
        .catch(err => console.error(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (asJson) {
    // Pure JSON mode for API users / scripts ("打开接口")
    return (
      <pre className="p-5 whitespace-pre-wrap font-mono text-sm bg-gray-900 text-gray-100 min-h-screen">
        {JSON.stringify(data || { loading }, null, 2)}
      </pre>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-sans text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-600" />
        <p>安全收件箱加载中...</p>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-gray-200/50 max-w-md w-full text-center border border-red-100">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">访问被拒绝</h2>
          <p className="text-gray-500">{error || data?.error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  const { mailbox, link, emails = [] } = data;

  const fmtDate = (t: string) => new Date(t).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  const fmtTime = (t: string) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900 pb-20">
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm shadow-gray-100/50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
              <Inbox className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight hidden sm:block">安全收件箱</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm bg-gray-100 text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200">
              {mailbox}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Link Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Eye className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">已用查看次数</span>
            </div>
            <div className="text-xl font-semibold text-gray-900">
              {link?.views_used || 0} <span className="text-sm font-normal text-gray-400">/ {link?.max_views || '∞'}</span>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">过期时间</span>
            </div>
            <div className="text-xl font-semibold text-gray-900 truncate">
              {link?.expires_at ? new Date(link.expires_at).toLocaleDateString('zh-CN') : '永不过期'}
            </div>
          </div>

          <div className="col-span-2 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4 rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-800 mb-1">
                <LinkIcon className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">API 数据接入</span>
              </div>
              <a href={`/api/open/${token}?format=json`} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline">
                查看原始 JSON 数据 &rarr;
              </a>
            </div>
          </div>
        </div>

        {/* Email Layout */}
        {emails.length === 0 ? (
          <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-gray-300" />
            </div>
            <div className="text-lg font-medium text-gray-700 mb-1">暂未收到邮件</div>
            <p className="text-sm text-gray-500">等待后台同步中，请稍后刷新页面查看最新内容。</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 h-[700px] mb-8">
            {/* Left Sidebar: Email List */}
            <div className="w-full md:w-1/3 lg:w-1/4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 shrink-0 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">邮件列表</h3>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => {
                      if (selected?.id !== email.id) {
                        setSelected(null); // Show loading state
                        void loadFull(email.id);
                      }
                    }}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selected?.id === email.id ? 'bg-emerald-50/50 border-l-2 border-emerald-500' : 'border-l-2 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm text-gray-900 truncate pr-2">
                        {email.from || email.from_addr || '未知发件人'}
                      </div>
                      <div className="text-[10px] text-gray-400 whitespace-nowrap pt-0.5">
                        {fmtDate(email.received_at)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {email.subject || '(无主题)'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Side: Detail */}
            <div className="w-full md:w-2/3 lg:w-3/4 bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 flex flex-col h-full overflow-hidden">
              
              {/* Detail Header */}
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">
                    {selected?.subject || data?.emails?.find(e => e.id === selected?.id)?.subject || '(无主题)'}
                  </h2>
                </div>
                
                {selected ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <User className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-900">{selected.from_name || selected.from_addr}</span>
                      {selected.from_name && <span className="text-gray-400">&lt;{selected.from_addr}&gt;</span>}
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{fmtDate(selected.received_at)} {fmtTime(selected.received_at)}</span>
                      <span className="text-gray-300 px-1">•</span>
                      <span>收件人: {selected.mailbox_email}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> 正在加载邮件内容...
                  </div>
                )}
              </div>

              {/* Detail Body */}
              <div className="p-6 overflow-y-auto overflow-x-hidden flex-1 bg-white">
                {!selected ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载中...
                  </div>
                ) : selected.html_body ? (
                  <div
                    className="prose prose-sm max-w-none prose-a:text-blue-600 prose-img:max-w-full prose-img:rounded-lg break-words"
                    dangerouslySetInnerHTML={{
                      __html: selected.html_body.replace(/<script[\s\S]*?<\/script>/gi, ''),
                    }}
                  />
                ) : selected.text_body ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 break-words">
                    {selected.text_body}
                  </pre>
                ) : (
                  <div className="text-center text-gray-400 py-12 italic">此邮件无正文内容</div>
                )}
              </div>

              {/* Detail Footer (Raw) */}
              {selected?.raw && (
                <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                  <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 select-none list-none">
                      <FileCode2 className="w-4 h-4" />
                      查看原始邮件 (Raw Source)
                      <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 ml-auto" />
                    </summary>
                    <div className="mt-4 bg-gray-900 rounded-xl p-4 overflow-auto max-h-[300px]">
                      <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                        {selected.raw.slice(0, 20000)}
                        {selected.raw.length > 20000 ? '\n\n... (截断)' : ''}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
              
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
