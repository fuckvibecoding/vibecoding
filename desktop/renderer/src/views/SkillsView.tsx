// 技能视图:本地技能/指令卡片网格(available_commands_update 投影)+
// SkillHub 在线市场(ACP-only 投影,数据与安装全部经过 ACP)。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Slash, Zap } from 'lucide-react';

import { EmptyState, PageHead, PageInner, PageScroll } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { injectToComposer } from '@/core/composer';
import { t } from '@/core/i18n';
import {
  activateSkill,
  commandKind,
  installSkill,
  loadCatalogBootstrap,
  loadCategories,
  loadSkillDetail,
  searchSkills,
  skillTitle,
  uninstallSkill,
  type CategoryEntry,
  type Market,
  type Skill,
  type Target,
} from '@/core/skillhub';
import { hasFeature, state } from '@/core/state';
import { switchView } from '@/core/views';
import { useAppState } from '@/hooks/useAppState';

function SkillCards() {
  const appState = useAppState();
  if (appState.availableCommands.length === 0) {
    return <EmptyState icon={<Zap />} title={t('skills.empty')} />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
      {appState.availableCommands.map((command) => {
        const kind = commandKind(command);
        return (
          <div
            key={command.name}
            className="relative cursor-pointer rounded-xl border border-border bg-card p-3.5 transition-all hover:-translate-y-px hover:border-primary hover:shadow-float"
            role="button"
            tabIndex={0}
            onClick={() => {
              injectToComposer(command.name.startsWith('/') ? `${command.name} ` : `/${command.name} `);
              switchView(state.activeSessionId ? 'chat' : 'home');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                injectToComposer(command.name.startsWith('/') ? `${command.name} ` : `/${command.name} `);
                switchView(state.activeSessionId ? 'chat' : 'home');
              }
            }}
          >
            <div className="mb-2.5 flex size-[38px] items-center justify-center rounded-[10px] bg-primary/8 text-primary">
              {kind === 'skill' ? <Zap className="size-5" /> : <Slash className="size-5" />}
            </div>
            <div className="mb-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-strong">
              <span className="truncate">{command.name}</span>
              <Badge variant={kind === 'skill' ? 'accent' : 'info'}>
                {kind === 'skill' ? t('skills.kindSkill') : t('skills.kindCommand')}
              </Badge>
            </div>
            <div className="line-clamp-3 text-[12px] leading-normal text-muted-foreground">{command.description || ''}</div>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-primary">{t('skills.use')}</div>
          </div>
        );
      })}
    </div>
  );
}

function SkillHubCatalog() {
  const appState = useAppState();
  const sessionId = appState.activeSessionId;
  const serialRef = useRef(0);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [market, setMarket] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Skill[] | null>(null);
  const [detail, setDetail] = useState<Skill | null>(null);
  const [catalogError, setCatalogError] = useState('');

  const activeSkillsRef = useRef(activeSkills);
  activeSkillsRef.current = activeSkills;

  const loadResults = useCallback(
    async (chosenMarket: string, text: string, chosenCategory: string, official: boolean) => {
      if (!sessionId) return;
      const serial = ++serialRef.current;
      setItems(null);
      try {
        const found = await searchSkills({ sessionId, market: chosenMarket, query: text, category: chosenCategory, official });
        if (serial !== serialRef.current || state.activeSessionId !== sessionId || market !== chosenMarket) return;
        setItems(found);
        if (found[0]) {
          const first = await loadSkillDetail(sessionId, chosenMarket, found[0].id);
          if (serial === serialRef.current && state.activeSessionId === sessionId) setDetail(first);
        } else {
          setDetail(null);
        }
      } catch (error) {
        if (serial !== serialRef.current) return;
        setCatalogError(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`);
        setItems([]);
      }
    },
    [market, sessionId],
  );

  // 会话或能力变化时重建目录:市场/安装目标/已启用技能都来自 ACP 投影。
  useEffect(() => {
    if (!sessionId) {
      setMarkets([]);
      setItems(null);
      setDetail(null);
      return;
    }
    const serial = ++serialRef.current;
    setCatalogError('');
    setItems(null);
    setDetail(null);
    void (async () => {
      try {
        const bootstrap = await loadCatalogBootstrap(sessionId, market, targetDir, scope);
        if (serial !== serialRef.current || state.activeSessionId !== sessionId) return;
        setMarkets(bootstrap.markets);
        setTargets(bootstrap.targets);
        setActiveSkills(bootstrap.activeSkills);
        const nextMarket = bootstrap.market;
        const nextTarget = bootstrap.target;
        setMarket(nextMarket);
        setTargetDir(nextTarget?.path || '');
        setScope(nextTarget?.scope || 'project');
        const chosen = bootstrap.markets.find((entry) => entry.id === nextMarket);
        setCategories(chosen?.capabilities?.categories ? await loadCategories(sessionId, nextMarket) : []);
        setCategory('');
        await loadResults(nextMarket, query, '', nextMarket === 'skillhub.cn');
      } catch (error) {
        if (serial !== serialRef.current) return;
        setCatalogError(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`);
        setItems([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!hasFeature('manageSkillHubCatalog')) return null;

  const currentMarket = markets.find((entry) => entry.id === market);
  const isOfficialMarket = market === 'skillhub.cn';

  const openDetail = async (skill: Skill) => {
    if (!sessionId) return;
    try {
      const full = await loadSkillDetail(sessionId, skill.market, skill.id);
      if (state.activeSessionId === sessionId) setDetail(full);
    } catch (error) {
      setCatalogError(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const refreshAfterMutation = async () => {
    if (!sessionId) return;
    const bootstrap = await loadCatalogBootstrap(sessionId, market, targetDir, scope);
    setMarkets(bootstrap.markets);
    setTargets(bootstrap.targets);
    setActiveSkills(bootstrap.activeSkills);
    await loadResults(market, query, category, false);
  };

  return (
    <section className="mt-[26px] border-t border-border pt-[22px]" aria-live="polite">
      <div className="mb-1 text-[17px] font-semibold text-foreground">{t('skills.marketplace')}</div>
      <div className="text-[11.5px] text-muted-foreground">
        {sessionId ? t('skills.marketplaceDesc') : t('skills.marketplaceSessionRequired')}
      </div>
      {sessionId ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select
              value={market}
              onValueChange={(value) => {
                setMarket(value);
                setCategories([]);
                setCategory('');
                void (async () => {
                  const chosen = markets.find((entry) => entry.id === value);
                  if (chosen?.capabilities?.categories) setCategories(await loadCategories(sessionId, value));
                  await loadResults(value, query, '', value === 'skillhub.cn');
                })();
              }}
            >
              <SelectTrigger className="min-w-[150px] flex-1">
                <SelectValue placeholder={t('skills.marketplace')} />
              </SelectTrigger>
              <SelectContent>
                {markets.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name || entry.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={targetDir}
              onValueChange={(value) => {
                const found = targets.find((entry) => entry.path === value);
                setTargetDir(found?.path || '');
                setScope(found?.scope || 'project');
              }}
            >
              <SelectTrigger className="min-w-[150px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((entry) => (
                  <SelectItem key={entry.path} value={entry.path}>
                    {`${entry.label} · ${entry.scope}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOfficialMarket ? (
              <Button variant="outline" onClick={() => void loadResults(market, query, category, true)}>
                {t('skills.official')}
              </Button>
            ) : null}
            {currentMarket?.capabilities?.categories ? (
              <Select
                value={category || '__all'}
                onValueChange={(value) => {
                  const next = value === '__all' ? '' : value;
                  setCategory(next);
                  void loadResults(market, query, next, false);
                }}
              >
                <SelectTrigger className="min-w-[120px]">
                  <SelectValue placeholder={t('skills.allCategories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{t('skills.allCategories')}</SelectItem>
                  {categories.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      {entry.nameEn || entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadResults(market, query, category, false);
            }}
          >
            <Input
              className="min-w-[150px] flex-[1_1_180px]"
              placeholder={t('skills.marketplaceSearch')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" className="shrink-0">
              {t('skills.search')}
            </Button>
          </form>

          {catalogError ? <div className="mt-3 text-[11.5px] text-danger">{catalogError}</div> : null}

          <div className="mt-3.5 grid grid-cols-[minmax(220px,.9fr)_minmax(250px,1.1fr)] gap-3.5 max-[760px]:grid-cols-1">
            <div className="flex min-w-0 flex-col gap-2">
              {items === null ? (
                <div className="text-[11.5px] text-muted-foreground">{t('skills.marketplaceLoading')}</div>
              ) : items.length === 0 ? (
                <div className="text-[14px] font-semibold text-muted-foreground">{t('skills.marketplaceEmpty')}</div>
              ) : (
                items.map((skill) => (
                  <button
                    key={`${skill.market}:${skill.id}`}
                    type="button"
                    className="rounded-[9px] border border-border bg-card p-3 text-left hover:border-primary hover:bg-hoverbg"
                    onClick={() => void openDetail(skill)}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 font-semibold">
                      <span className="truncate">{skillTitle(skill)}</span>
                      {skill.suspicious ? <Badge variant="danger">{t('skills.risk')}</Badge> : null}
                      {skill.installed?.installed ? (
                        <Badge variant="info">{skill.installed.updateAvailable ? t('skills.updateAvailable') : t('skills.installed')}</Badge>
                      ) : null}
                    </div>
                    <div className="line-clamp-2 text-[11.5px] text-muted-foreground">{skill.description || ''}</div>
                  </button>
                ))
              )}
            </div>
            <aside className="flex min-h-[150px] min-w-0 flex-col gap-2 self-start rounded-[9px] border border-border bg-card p-3">
              {detail === null ? (
                items === null ? <div className="text-[11.5px] text-muted-foreground">{t('skills.detailLoading')}</div> : null
              ) : (
                <>
                  <div className="text-[16px] font-semibold text-strong">{skillTitle(detail)}</div>
                  <div className="text-[11.5px] text-muted-foreground">{detail.description || ''}</div>
                  <div className="mt-2.5 text-[12px] text-muted-foreground">
                    {[detail.version, detail.author, detail.category].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={async () => {
                        const installed = Boolean(detail.installed?.installed);
                        const ok = await installSkill({ sessionId: sessionId || '', skill: detail, overwrite: installed, scope, targetDir });
                        if (ok) await refreshAfterMutation();
                      }}
                    >
                      {detail.installed?.installed ? t('skills.update') : t('skills.install')}
                    </Button>
                    {detail.installed?.installed && !activeSkills.includes(detail.installed?.name || detail.slug || detail.name || '') ? (
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const next = await activateSkill(sessionId || '', detail);
                          if (next) setActiveSkills(next);
                        }}
                      >
                        {t('skills.activate')}
                      </Button>
                    ) : null}
                    {detail.installed?.installed ? (
                      <Button
                        variant="deny"
                        onClick={async () => {
                          const ok = await uninstallSkill(sessionId || '', detail, scope);
                          if (ok) await refreshAfterMutation();
                        }}
                      >
                        {t('skills.uninstall')}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function SkillsView() {
  return (
    <PageScroll>
      <PageInner>
        <PageHead title={t('skills.title')} subtitle={t('skills.subtitle')} />
        <SkillCards />
        <SkillHubCatalog />
      </PageInner>
    </PageScroll>
  );
}
