// UI 宿主:把 core/ui-host 的 toast/prompt/confirm/preview 请求投影为
// sonner toast 与 shadcn Dialog。core 动作层因此保持零 DOM 依赖。

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast as sonnerToast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { registerUiHost, type PromptModalOptions } from '@/core/ui-host';
import { t } from '@/core/i18n';

interface PromptState {
  options: PromptModalOptions;
  resolve: (value: string | null) => void;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

export function UiHost() {
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const promptInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return registerUiHost({
      toast: (message) => sonnerToast(message),
      prompt: (options) =>
        new Promise<string | null>((resolve) => {
          setPromptValue(options.initialValue || '');
          setPromptState({ options, resolve });
        }),
      confirm: (message) =>
        new Promise<boolean>((resolve) => {
          setConfirmState({ message, resolve });
        }),
      previewImage: (source) => setPreviewSource(source),
    });
  }, []);

  useEffect(() => {
    if (!promptState) return;
    const timer = window.setTimeout(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [promptState]);

  const finishPrompt = useCallback(
    (value: string | null) => {
      if (!promptState) return;
      promptState.resolve(value);
      setPromptState(null);
    },
    [promptState],
  );

  const submitPrompt = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      if (!promptState) return;
      const value = promptValue.trim();
      finishPrompt(value || promptState.options.allowEmpty ? value : null);
    },
    [finishPrompt, promptState, promptValue],
  );

  const finishConfirm = useCallback((value: boolean) => {
    setConfirmState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  return (
    <>
      <Dialog
        open={promptState !== null}
        onOpenChange={(open) => {
          if (!open) finishPrompt(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{promptState?.options.title || ''}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={submitPrompt}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !promptState?.options.multiline) submitPrompt(event);
            }}
          >
            {promptState?.options.multiline ? (
              <Textarea
                ref={(node) => {
                  promptInputRef.current = node;
                }}
                rows={4}
                value={promptValue}
                placeholder={promptState?.options.placeholder}
                onChange={(event) => setPromptValue(event.target.value)}
              />
            ) : (
              <Input
                ref={(node) => {
                  promptInputRef.current = node;
                }}
                type={promptState?.options.secret ? 'password' : 'text'}
                maxLength={120}
                value={promptValue}
                placeholder={promptState?.options.placeholder}
                onChange={(event) => setPromptValue(event.target.value)}
              />
            )}
            <DialogFooter className="mt-3.5">
              <Button type="button" variant="outline" onClick={() => finishPrompt(null)}>
                {promptState?.options.cancelLabel}
              </Button>
              <Button type="submit">{promptState?.options.okLabel}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmState !== null}
        onOpenChange={(open) => {
          if (!open) finishConfirm(false);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{confirmState?.message}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => finishConfirm(false)}>
              {t('modal.cancel')}
            </Button>
            <Button variant="destructive" autoFocus onClick={() => finishConfirm(true)}>
              {t('modal.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewSource !== null} onOpenChange={(open) => !open && setPreviewSource(null)}>
        <DialogContent className="w-[min(860px,94vw)] max-h-[90vh]" showCloseButton>
          {previewSource ? (
            <img
              src={previewSource}
              alt=""
              className="max-h-[72vh] w-full rounded-lg bg-code object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
