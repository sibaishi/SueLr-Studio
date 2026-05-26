import type { AccountDetailsLogItem } from '@/features/settings';
import { IOSButton, IOSInput, IOSLabel } from '@/shared/ui/ios';
import { FileText, RefreshCcw, Wallet } from 'lucide-react';
import type { SettingsActions, SettingsViewModel } from './shared';
import { EmptyStateCard, SectionCard, chipStyle, mutedPanelStyle } from './styles';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

function formatDate(timestamp?: number) {
  if (!timestamp) return '尚未刷新';
  return new Date(timestamp * (timestamp < 10_000_000_000 ? 1000 : 1)).toLocaleString();
}

function formatAmount(value?: number) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : '-';
}

function formatNumber(value?: number) {
  return Number.isFinite(value) ? Number(value).toLocaleString() : '-';
}

function logTitle(log: AccountDetailsLogItem) {
  return log.modelName || log.tokenName || `日志 ${log.id || ''}`.trim();
}

export function AccountDetailsSection({ T, actions, view }: Props) {
  const account = view.accountDetails;
  const balance = account?.balance;
  const logs = view.accountDetailsLogs;
  const userLabel = account?.user?.displayName || account?.user?.username || account?.username || '未登录';
  const page = logs?.page || view.accountDetailsLogsPage;
  const pageSize = logs?.pageSize || 20;
  const total = logs?.total || 0;
  const hasNext = page * pageSize < total;

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="账号凭据"
        description="配置用于查询账号明细的网页登录账号。当前已接入的站点凭据只保存在本机后端配置文件中。"
        action={<Wallet size={14} color={T.text3} />}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <IOSLabel>用户名</IOSLabel>
              <IOSInput
                value={view.accountDetailsUsername}
                onChange={actions.setAccountDetailsUsername}
                placeholder="用户名"
              />
            </div>
            <div>
              <IOSLabel>密码</IOSLabel>
              <IOSInput
                value={view.accountDetailsPassword}
                onChange={actions.setAccountDetailsPassword}
                type="password"
                placeholder={account?.configured ? '已保存，留空不修改' : '密码'}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <IOSButton
              small
              label={view.accountDetailsSaving ? '登录中...' : '保存并登录'}
              onClick={() => void actions.saveAccountDetails()}
              disabled={
                view.accountDetailsSaving || !view.accountDetailsUsername.trim() || !view.accountDetailsPassword.trim()
              }
            />
            <IOSButton
              small
              label={view.accountDetailsRefreshing ? '刷新中...' : '刷新明细'}
              onClick={() => void actions.refreshAccountDetails()}
              disabled={view.accountDetailsRefreshing || !account?.configured}
              color={T.green}
            />
            <IOSButton
              small
              label="清除账号"
              onClick={() => void actions.clearAccountDetails()}
              disabled={!account?.configured}
              color={T.red}
            />
          </div>
          {!account?.configured && (
            <EmptyStateCard
              title="还没有配置账号"
              body="保存并登录后，后端会保留会话 cookie，并立即刷新账号明细。"
              action="这里不会展示已保存的密码或 session。"
            />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="账号状态"
        description="展示当前接入站点返回的余额、用量和请求统计。"
        action={<RefreshCcw size={14} color={T.text3} />}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={chipStyle(account?.configured ? T.green : T.orange)}>
              {account?.configured ? '已配置' : '未配置'}
            </span>
            <span style={chipStyle(account?.loggedIn ? T.blue : undefined)}>
              {account?.loggedIn ? '会话已保存' : '未登录'}
            </span>
            <span style={chipStyle(balance ? T.purple : undefined)}>{formatDate(balance?.refreshedAt)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ ...mutedPanelStyle(), padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>登录用户</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  marginTop: 8,
                  overflowWrap: 'anywhere',
                }}
              >
                {userLabel}
              </div>
            </div>
            <div style={{ ...mutedPanelStyle(), padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>余额</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                {formatAmount(balance?.balance)}
              </div>
            </div>
            <div style={{ ...mutedPanelStyle(), padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>总用量</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                {formatAmount(balance?.usedBalance)}
              </div>
            </div>
            <div style={{ ...mutedPanelStyle(), padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>请求次数</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                {formatNumber(balance?.requestCount)}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="调用日志"
        description="按当前登录账号查询最近 API 调用记录。"
        action={<FileText size={14} color={T.text3} />}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={chipStyle(logs?.total ? T.blue : undefined)}>共 {formatNumber(logs?.total || 0)} 条</span>
              <span style={chipStyle()}>第 {page} 页</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <IOSButton
                small
                label="上一页"
                onClick={() => actions.setAccountDetailsLogsPage(Math.max(1, page - 1))}
                disabled={!account?.configured || page <= 1 || view.accountDetailsLogsLoading}
              />
              <IOSButton
                small
                label="下一页"
                onClick={() => actions.setAccountDetailsLogsPage(page + 1)}
                disabled={!account?.configured || !hasNext || view.accountDetailsLogsLoading}
              />
              <IOSButton
                small
                label={view.accountDetailsLogsLoading ? '加载中...' : '刷新日志'}
                onClick={() => void actions.refreshAccountDetailsLogs()}
                disabled={!account?.configured || view.accountDetailsLogsLoading}
                color={T.green}
              />
            </div>
          </div>

          {!account?.configured && (
            <EmptyStateCard title="需要先配置账号" body="登录后才能读取当前账号下的调用日志。" />
          )}
          {account?.configured && !view.accountDetailsLogsLoading && (logs?.items.length || 0) === 0 && (
            <EmptyStateCard title="还没有调用日志" body="当前账号暂时没有可展示的调用记录，或接口返回了空列表。" />
          )}

          {(logs?.items || []).map((log) => (
            <div key={`${log.id}-${log.createdAt}-${log.modelName}`} style={{ ...mutedPanelStyle(), padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {logTitle(log)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                    {formatDate(log.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={chipStyle(T.purple)}>消耗 {formatAmount(log.cost)}</span>
                  <span style={chipStyle()}>输入 {formatNumber(log.promptTokens)}</span>
                  <span style={chipStyle()}>输出 {formatNumber(log.completionTokens)}</span>
                </div>
              </div>
              {log.tokenName && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  Token：{log.tokenName}
                </div>
              )}
              {log.content && (
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: 'var(--color-text-secondary)',
                    marginTop: 8,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {log.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
