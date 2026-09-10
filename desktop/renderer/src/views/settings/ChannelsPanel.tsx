// Channels 面板:mothx/manage/channels 投影。制品开关、微信与飞书配置;
// 凭据只可写入不回显,微信 workDir 为必填。

import { useEffect, useState } from 'react';

import { Field, FieldGrid, ManageCard, ManageHeader, ManageWorkspace, ToggleField, UnsupportedRow } from '@/components/manage-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/core/i18n';
import { loadChannels, saveChannels, type ChannelsConfigPatch, type ChannelsConfigView } from '@/core/manage-api';
import { hasFeature } from '@/core/state';
import { toast } from '@/core/ui-host';
import { useAppState } from '@/hooks/useAppState';

export function ChannelsPanel() {
  const appState = useAppState();
  const ready = appState.connection.state === 'ready';
  const supported = hasFeature('manageChannels');
  const [view, setView] = useState<ChannelsConfigView | null>(null);
  const [artifact, setArtifact] = useState(false);
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [wechatWorkDir, setWechatWorkDir] = useState('');
  const [wechatAutoTyping, setWechatAutoTyping] = useState(true);
  const [wechatCred, setWechatCred] = useState('');
  const [wechatCredConfigured, setWechatCredConfigured] = useState(false);
  const [wechatClearCred, setWechatClearCred] = useState(false);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [feishuWorkDir, setFeishuWorkDir] = useState('');
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [feishuAppIdConfigured, setFeishuAppIdConfigured] = useState(false);
  const [feishuAppSecretConfigured, setFeishuAppSecretConfigured] = useState(false);
  const [feishuClearAppId, setFeishuClearAppId] = useState(false);
  const [feishuClearAppSecret, setFeishuClearAppSecret] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const hydrate = (loaded: ChannelsConfigView) => {
    setView(loaded);
    const wechat = loaded.wechat || {};
    const feishu = loaded.feishu || {};
    setArtifact(loaded.artifact === true);
    setWechatEnabled(wechat.enabled === true);
    setWechatWorkDir(wechat.workDir || '');
    setWechatAutoTyping(wechat.autoTyping !== false);
    setWechatCred('');
    setWechatCredConfigured(wechat.credentialConfigured === true);
    setWechatClearCred(false);
    setFeishuEnabled(feishu.enabled === true);
    setFeishuWorkDir(feishu.workDir || '');
    setFeishuAppId('');
    setFeishuAppSecret('');
    setFeishuAppIdConfigured(feishu.appIDConfigured === true);
    setFeishuAppSecretConfigured(feishu.appSecretConfigured === true);
    setFeishuClearAppId(false);
    setFeishuClearAppSecret(false);
  };

  useEffect(() => {
    if (!ready || !supported) return;
    let cancelled = false;
    void loadChannels().then((loaded) => {
      if (!cancelled && loaded) hydrate(loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, supported]);

  if (!supported) return <UnsupportedRow text={t('manage.unsupported')} />;
  if (!view) return <UnsupportedRow text="…" />;

  const save = async (which: string, patch: ChannelsConfigPatch) => {
    setSaving(which);
    try {
      const updated = await saveChannels(patch);
      hydrate(updated);
      toast(t('settings.channelsSaved'));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(null);
    }
  };

  const saveWechat = () => {
    const workDir = wechatWorkDir.trim();
    if (!workDir) {
      toast(t('settings.channelsWorkDirRequired'));
      return;
    }
    const patch: ChannelsConfigPatch = { wechat: { enabled: wechatEnabled, workDir, autoTyping: wechatAutoTyping } };
    if (wechatClearCred) patch.wechat!.clearCredPath = true;
    else if (wechatCred.trim()) patch.wechat!.credPath = wechatCred.trim();
    void save('wechat', patch);
  };

  const saveFeishu = () => {
    const workDir = feishuWorkDir.trim();
    if (!workDir) {
      toast(t('settings.channelsWorkDirRequired'));
      return;
    }
    const patch: ChannelsConfigPatch = { feishu: { enabled: feishuEnabled, workDir } };
    if (feishuClearAppId) patch.feishu!.clearAppId = true;
    else if (feishuAppId.trim()) patch.feishu!.appId = feishuAppId.trim();
    if (feishuClearAppSecret) patch.feishu!.clearAppSecret = true;
    else if (feishuAppSecret.trim()) patch.feishu!.appSecret = feishuAppSecret.trim();
    void save('feishu', patch);
  };

  return (
    <ManageWorkspace>
      <ManageHeader eyebrow={t('settings.channelsGroup')} title={t('settings.channelsTitle')} desc={t('settings.channelsDesc')} />
      <div className="text-[11.5px] text-muted-foreground">{t('settings.channelsHint')}</div>

      <ManageCard title={t('settings.channelsArtifact')} desc={t('settings.channelsArtifactDesc')}>
        <FieldGrid>
          <ToggleField label={t('settings.channelsArtifactEnabled')} checked={artifact} onChange={setArtifact} />
        </FieldGrid>
        <Button className="mt-3" disabled={saving !== null} onClick={() => void save('artifact', { artifact })}>
          {saving === 'artifact' ? t('settings.channelsSaving') : t('settings.channelsSave')}
        </Button>
      </ManageCard>

      <ManageCard title={t('settings.channelsWechat')} desc={t('settings.channelsWechatDesc')}>
        <FieldGrid>
          <ToggleField label={t('settings.channelsEnabled')} checked={wechatEnabled} onChange={setWechatEnabled} />
          <Field label={t('settings.channelsWorkDir')}>
            <Input value={wechatWorkDir} onChange={(event) => setWechatWorkDir(event.target.value)} />
          </Field>
          <ToggleField label={t('settings.channelsAutoTyping')} checked={wechatAutoTyping} onChange={setWechatAutoTyping} />
          <Field label={t('settings.channelsCredPath')}>
            <Input
              type="password"
              value={wechatCred}
              placeholder={wechatCredConfigured ? t('settings.channelsCredConfigured') : t('settings.channelsCredUnset')}
              onChange={(event) => setWechatCred(event.target.value)}
            />
          </Field>
          <ToggleField label={t('settings.channelsClearCred')} checked={wechatClearCred} onChange={setWechatClearCred} />
        </FieldGrid>
        <Button className="mt-3" disabled={saving !== null} onClick={saveWechat}>
          {saving === 'wechat' ? t('settings.channelsSaving') : t('settings.channelsSave')}
        </Button>
      </ManageCard>

      <ManageCard title={t('settings.channelsFeishu')} desc={t('settings.channelsFeishuDesc')}>
        <FieldGrid>
          <ToggleField label={t('settings.channelsEnabled')} checked={feishuEnabled} onChange={setFeishuEnabled} />
          <Field label={t('settings.channelsWorkDir')}>
            <Input value={feishuWorkDir} onChange={(event) => setFeishuWorkDir(event.target.value)} />
          </Field>
          <Field label={t('settings.channelsAppID')}>
            <Input
              type="password"
              value={feishuAppId}
              placeholder={feishuAppIdConfigured ? t('settings.channelsAppIDConfigured') : t('settings.channelsAppIDUnset')}
              onChange={(event) => setFeishuAppId(event.target.value)}
            />
          </Field>
          <Field label={t('settings.channelsAppSecret')}>
            <Input
              type="password"
              value={feishuAppSecret}
              placeholder={feishuAppSecretConfigured ? t('settings.channelsAppSecretConfigured') : t('settings.channelsAppSecretUnset')}
              onChange={(event) => setFeishuAppSecret(event.target.value)}
            />
          </Field>
          <ToggleField label={t('settings.channelsClearAppID')} checked={feishuClearAppId} onChange={setFeishuClearAppId} />
          <ToggleField label={t('settings.channelsClearAppSecret')} checked={feishuClearAppSecret} onChange={setFeishuClearAppSecret} />
        </FieldGrid>
        <Button className="mt-3" disabled={saving !== null} onClick={saveFeishu}>
          {saving === 'feishu' ? t('settings.channelsSaving') : t('settings.channelsSave')}
        </Button>
      </ManageCard>
    </ManageWorkspace>
  );
}
