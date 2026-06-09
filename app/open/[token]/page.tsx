'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  copyTextToClipboard,
  extractVerificationCode,
  normalizeOpenData,
  OPEN_MAIL_POLL_INTERVAL_MS,
  type OpenData,
  type RawOpenData,
} from '@/lib/open-mail';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileCode2,
  Inbox,
  Link as LinkIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
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

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExpiry(value?: string | null) {
  if (!value) return '永不过期';
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function maskToken(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function sanitizeHtmlDocument(html: string) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const previewStyles = `
    <style id="cloudmail-open-preview">
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #0f172a;
      }
      body {
        min-height: 100%;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100% !important;
      }
      a {
        word-break: break-word;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  `.trim();

  if (/<\/head>/i.test(withoutScripts)) {
    return withoutScripts.replace(/<\/head>/i, `${previewStyles}</head>`);
  }

  if (/<body[^>]*>/i.test(withoutScripts)) {
    return withoutScripts.replace(/<body([^>]*)>/i, `<body$1>${previewStyles}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${previewStyles}</head><body>${withoutScripts}</body></html>`;
}

export default function OpenViewer() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const asJson = search.get('format') === 'json' || search.get('type') === 'json';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpenData | null>(null);
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FullEmail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState(720);
  const [copyStatus, setCopyStatus] = useState<{ kind: 'mailbox' | 'code'; ok: boolean } | null>(null);
  const htmlPreview = selected?.html_body ? sanitizeHtmlDocument(selected.html_body) : null;

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    const load = async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
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
        if (active && !silent) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load(true);
    }, OPEN_MAIL_POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const activeId = data?.emails?.some((email) => email.id === userSelectedId)
    ? userSelectedId
    : (data?.emails?.[0]?.id ?? null);

  useEffect(() => {
    if (!activeId) return undefined;

    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      setSelected(null);

      try {
        const response = await fetch(`/api/received/${activeId}?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const json = await response.json() as ReceivedResponse;
        if (active) {
          setSelected(json.email);
        }
      } catch (loadError: unknown) {
        if (active) {
          setDetailError(getErrorMessage(loadError));
        }
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetail();
    return () => {
      active = false;
    };
  }, [activeId, token]);

  useEffect(() => {
    if (!htmlPreview) return undefined;

    const syncIframeHeight = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      try {
        const doc = iframe.contentDocument;
        const body = doc?.body;
        const html = doc?.documentElement;
        if (!body || !html) return;

        const nextHeight = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.scrollHeight,
          html.offsetHeight,
          560,
        );

        setIframeHeight(nextHeight);
      } catch {
        setIframeHeight(720);
      }
    };

    const timer = window.setTimeout(syncIframeHeight, 120);
    const interval = window.setInterval(syncIframeHeight, 900);
    window.addEventListener('resize', syncIframeHeight);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('resize', syncIframeHeight);
    };
  }, [htmlPreview]);

  if (asJson) {
    return (
      <pre className="min-h-screen whitespace-pre-wrap bg-[#061310] p-5 font-mono text-sm text-emerald-100">
        {JSON.stringify(data || { loading }, null, 2)}
      </pre>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#061310] px-6 text-center text-emerald-50">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_80px_rgba(16,185,129,0.16)]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
        </div>
        <p className="text-lg font-medium">安全收件箱加载中...</p>
        <p className="mt-2 max-w-md text-sm text-emerald-100/65">正在连接受控链接并同步最新邮件内容。</p>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#061310] p-4">
        <div className="w-full max-w-md rounded-[28px] border border-red-500/20 bg-white/95 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">访问被拒绝</h2>
          <p className="text-gray-500">{error || data?.error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  const { mailbox, link, emails = [] } = data;
  const activeEmail = emails.find((email) => email.id === activeId) ?? emails[0] ?? null;
  const mailboxLocalPart = mailbox.split('@')[0] || mailbox;
  const mailboxDomain = mailbox.split('@')[1] || 'mailbox';
  const remainingViews = typeof link?.remaining === 'number'
    ? link.remaining
    : (typeof link?.max_views === 'number' ? Math.max(link.max_views - (link?.views_used || 0), 0) : null);
  const verificationCode = extractVerificationCode({
    subject: selected?.subject || activeEmail?.subject || null,
    text_body: selected?.text_body || null,
    html_body: selected?.html_body || null,
  });

  async function handleCopy(kind: 'mailbox' | 'code', value: string | null) {
    if (!value) {
      setCopyStatus({ kind, ok: false });
      window.setTimeout(() => {
        setCopyStatus((current) => (current?.kind === kind ? null : current));
      }, 1600);
      return;
    }

    try {
      await copyTextToClipboard(navigator.clipboard, value);
      setCopyStatus({ kind, ok: true });
    } catch {
      setCopyStatus({ kind, ok: false });
    }

    window.setTimeout(() => {
      setCopyStatus((current) => (current?.kind === kind ? null : current));
    }, 1600);
  }

  function getCopyLabel(kind: 'mailbox' | 'code', idleLabel: string, missingLabel: string) {
    if (copyStatus?.kind !== kind) return idleLabel;
    if (copyStatus.ok) return '已复制';
    return missingLabel;
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#061310] text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-emerald-400/12 blur-3xl" />
        <div className="absolute right-[-8rem] top-[8rem] h-[20rem] w-[20rem] rounded-full bg-cyan-400/8 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_20%),linear-gradient(140deg,rgba(20,184,166,0.08),transparent_55%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#061310]/82 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/12 text-emerald-200 shadow-[0_12px_30px_rgba(16,185,129,0.18)]">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-emerald-200/70">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure Access
              </div>
              <h1 className="hidden text-lg font-semibold tracking-tight text-white sm:block">安全收件箱</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 md:block">
              Token {maskToken(token)}
            </div>
            <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">
              只读访问
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-white/7 p-6 shadow-[0_28px_120px_rgba(3,7,18,0.45)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100/90">
              <Sparkles className="h-3.5 w-3.5" />
              纯净阅读模式
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              原始 HTML 优先
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Secure Mailbox</p>
              <h2 className="mt-3 max-w-4xl break-all text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {mailboxLocalPart}
                <span className="ml-2 text-emerald-200/85">@{mailboxDomain}</span>
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                这里集中展示受控链接下的邮件，正文优先按原始 HTML 排版阅读，文字信息只保留必要摘要。
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-4 text-slate-200">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">邮箱地址</div>
                  <div className="mt-2 break-all font-mono text-sm text-white">{mailbox}</div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-4 text-slate-200">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">最近来信</div>
                  <div className="mt-2 text-base font-semibold text-white">
                    {emails[0] ? formatDateTime(emails[0].received_at) : '暂无记录'}
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-4 text-slate-200">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">链接状态</div>
                  <div className="mt-2 text-base font-semibold text-white">
                    {emails.length > 0 ? `已同步 ${emails.length} 封邮件` : '等待同步'}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {remainingViews === null ? '不限查看次数' : `剩余 ${remainingViews} 次查看`}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <a
                  href={`/api/open/${token}?format=json`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/12 px-4 py-3 font-medium text-emerald-100 transition hover:border-emerald-200/35 hover:bg-emerald-300/18"
                >
                  <LinkIcon className="h-4 w-4" />
                  原始 JSON
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopy('mailbox', mailbox)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/12"
                >
                  {copyStatus?.kind === 'mailbox' && copyStatus.ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {getCopyLabel('mailbox', '复制邮箱', '复制失败')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('code', verificationCode)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selected && !activeEmail}
                >
                  {copyStatus?.kind === 'code' && copyStatus.ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {getCopyLabel('code', '复制验证码', '无验证码')}
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">访问摘要</div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">访问模式</div>
                  <div className="mt-1 text-base font-semibold text-white">只读公开链接</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Token</div>
                  <div className="mt-1 break-all font-mono text-sm text-white">{maskToken(token)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">过期时间</div>
                  <div className="mt-1 text-base font-semibold text-white">{formatExpiry(link?.expires_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-white/10 bg-white/7 p-5 shadow-[0_22px_80px_rgba(3,7,18,0.4)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              <Eye className="h-4 w-4 text-emerald-300" />
              访问次数
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">
              {link?.views_used || 0}
              <span className="ml-2 text-base font-normal text-slate-400">/ {link?.max_views ?? '∞'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {remainingViews === null ? '当前链接未设置次数上限。' : `剩余可查看 ${remainingViews} 次。`}
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/7 p-5 shadow-[0_22px_80px_rgba(3,7,18,0.4)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              <Clock className="h-4 w-4 text-cyan-300" />
              过期时间
            </div>
            <div className="mt-4 text-2xl font-semibold text-white">{formatExpiry(link?.expires_at)}</div>
            <p className="mt-1 text-sm text-slate-400">到期后链接自动失效</p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/7 p-5 shadow-[0_22px_80px_rgba(3,7,18,0.4)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              <Calendar className="h-4 w-4 text-fuchsia-300" />
              邮件数量
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">{emails.length}</div>
            <p className="mt-1 text-sm text-slate-400">默认展示最近一封</p>
          </div>
        </section>

        {emails.length === 0 ? (
          <div className="rounded-[32px] border border-white/10 bg-white/7 p-12 text-center shadow-[0_28px_100px_rgba(3,7,18,0.45)] backdrop-blur-xl">
            <div className="mx-auto mb-5 flex h-18 w-18 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
              <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <div className="text-xl font-semibold text-white">暂未收到邮件</div>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-slate-400">
              链接已经可用，但当前邮箱里还没有可展示的邮件内容。等待后台同步完成后，再刷新页面即可查看最新来信。
            </p>
          </div>
        ) : (
          <section className="space-y-6">
            {emails.length > 1 ? (
              <div className="rounded-[28px] border border-white/10 bg-white/7 p-4 shadow-[0_22px_80px_rgba(3,7,18,0.4)] backdrop-blur-xl">
                <div className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-400">最近来信</div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {emails.map((email) => {
                    const isActive = email.id === activeEmail?.id;
                    return (
                      <button
                        key={email.id}
                        type="button"
                        onClick={() => setUserSelectedId(email.id)}
                        className={`min-w-[240px] rounded-[22px] border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-emerald-300/35 bg-emerald-300/12 shadow-[0_16px_40px_rgba(16,185,129,0.16)]'
                            : 'border-white/10 bg-black/10 hover:border-white/15 hover:bg-white/7'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-sm font-semibold text-white">{email.subject || '(无主题)'}</div>
                          <div className="text-xs text-slate-400">{formatDateLabel(email.received_at)}</div>
                        </div>
                        <div className="mt-2 truncate text-xs text-slate-400">
                          {email.from || email.from_addr || '未知发件人'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white/7 shadow-[0_28px_100px_rgba(3,7,18,0.45)] backdrop-blur-xl">
              <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] px-6 py-6 sm:px-8">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-emerald-100/90">
                      当前正文
                    </div>
                    {activeEmail ? (
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        {activeEmail.has_html ? 'HTML 内容' : '纯文本'}
                      </div>
                    ) : null}
                  </div>
                  <h2 className="mt-4 max-w-5xl text-2xl font-semibold leading-tight text-white sm:text-[2rem]">
                    {selected?.subject || activeEmail?.subject || '(无主题)'}
                  </h2>
                </div>

                {detailLoading ? (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                    正在加载邮件详情...
                  </div>
                ) : selected ? (
                  <div className="mt-6 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-[22px] border border-white/10 bg-black/15 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                        <User className="h-4 w-4 text-emerald-300" />
                        发件人
                      </div>
                      <div className="mt-2 break-words text-sm font-medium text-white">
                        {selected.from_name || selected.from_addr || '未知发件人'}
                      </div>
                      {selected.from_name && selected.from_addr ? (
                        <div className="mt-1 break-all text-xs text-slate-400">{selected.from_addr}</div>
                      ) : null}
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/15 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                        <Calendar className="h-4 w-4 text-cyan-300" />
                        到达时间
                      </div>
                      <div className="mt-2 text-sm font-medium text-white">{formatDateTime(selected.received_at)}</div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/15 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">收件邮箱</div>
                      <div className="mt-2 break-all text-sm font-medium text-white">{selected.mailbox_email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-400">
                    {detailError || '邮件内容暂不可用'}
                  </div>
                )}
              </div>

              <div className="min-h-[560px] px-6 py-6 sm:px-8">
                {!selected && detailLoading ? (
                  <div className="flex h-full min-h-[280px] items-center justify-center text-slate-400">
                    <Loader2 className="mr-3 h-6 w-6 animate-spin text-emerald-300" />
                    邮件内容载入中...
                  </div>
                ) : detailError ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-dashed border-red-400/20 bg-red-500/5 px-6 text-center text-sm text-red-200/90">
                    {detailError}
                  </div>
                ) : htmlPreview ? (
                  <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
                    <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        安全 HTML 阅读视图
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        原版邮件
                      </p>
                    </div>
                    <iframe
                      ref={iframeRef}
                      title="邮件 HTML 预览"
                      srcDoc={htmlPreview}
                      sandbox="allow-same-origin"
                      onLoad={() => {
                        const iframe = iframeRef.current;
                        if (!iframe) return;

                        try {
                          const doc = iframe.contentDocument;
                          const body = doc?.body;
                          const html = doc?.documentElement;
                          if (!body || !html) return;

                          setIframeHeight(Math.max(body.scrollHeight, html.scrollHeight, 560));
                        } catch {
                          setIframeHeight(720);
                        }
                      }}
                      className="block w-full bg-white"
                      style={{ height: `${iframeHeight}px` }}
                    />
                  </div>
                ) : selected?.text_body ? (
                  <pre className="overflow-x-auto rounded-[30px] border border-white/10 bg-[#03100d] p-6 font-sans text-sm leading-7 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    {selected.text_body}
                  </pre>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-white/10 bg-black/10 py-16 text-center italic text-slate-400">
                    此邮件无正文内容
                  </div>
                )}
              </div>

              {selected?.raw ? (
                <div className="border-t border-white/10 bg-black/15 p-4 sm:p-6">
                  <details className="group">
                    <summary className="flex list-none cursor-pointer items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white">
                      <FileCode2 className="h-4 w-4" />
                      查看原始邮件 (Raw Source)
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="mt-4 overflow-auto rounded-[24px] border border-white/10 bg-[#020817] p-4 shadow-inner">
                      <pre className="max-h-[320px] overflow-auto text-xs leading-relaxed text-emerald-300">
                        {selected.raw.slice(0, 20000)}
                        {selected.raw.length > 20000 ? '\n\n... (截断)' : ''}
                      </pre>
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
