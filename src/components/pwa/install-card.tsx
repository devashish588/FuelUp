'use client';
import { useEffect, useState } from 'react';
import { Download, Check, Share, PlusSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { detectLivePlatform, hasDeferredPrompt, promptInstall, type InstallPlatform } from '@/lib/pwa/install';
import { useIsInstalledPWA } from '@/lib/pwa/use-is-installed-pwa';

/**
 * Settings → install status/action. Unobtrusive by placement: only users who
 * open Settings see it. Chromium uses the captured prompt; iOS gets
 * Add-to-Home-Screen steps; installed devices see status only.
 */
export function InstallCard() {
  const installed = useIsInstalledPWA();
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setPlatform(detectLivePlatform(hasDeferredPrompt()));
    update();
    window.addEventListener('fuelup:install-available', update);
    window.addEventListener('appinstalled', update);
    return () => {
      window.removeEventListener('fuelup:install-available', update);
      window.removeEventListener('appinstalled', update);
    };
  }, []);

  const onInstall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await promptInstall();
      setResult(outcome === 'accepted' ? 'Installing…' : outcome === 'dismissed' ? 'Install dismissed — you can try again anytime.' : null);
      setPlatform(detectLivePlatform(hasDeferredPrompt()));
    } finally {
      setBusy(false);
    }
  };

  if (installed || platform === 'installed') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[rgba(16,185,129,0.1)] flex items-center justify-center"><Check className="w-4 h-4 text-[#10b981]" /></div>
          <div><span className="text-[14px] font-medium text-white block">FuelUp is installed</span><span className="text-[11px] text-[#555]">Running as a standalone app</span></div>
        </div>
      </Card>
    );
  }

  if (platform === 'ios') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[rgba(240,165,0,0.1)] flex items-center justify-center"><Share className="w-4 h-4 text-[#f59e0b]" /></div>
          <div>
            <span className="text-[14px] font-medium text-white block">Install FuelUp</span>
            <span className="text-[11px] text-[#555] leading-relaxed block mt-0.5">
              Tap <Share className="w-3 h-3 inline" /> Share → <PlusSquare className="w-3 h-3 inline" /> Add to Home Screen
            </span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[rgba(240,165,0,0.1)] flex items-center justify-center"><Download className="w-4 h-4 text-[#f59e0b]" /></div>
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-medium text-white block">Install FuelUp</span>
          <span className="text-[11px] text-[#555] block">{result ?? 'Home-screen icon, fullscreen, works offline'}</span>
        </div>
        {platform === 'chromium' && (
          <button
            onClick={onInstall}
            disabled={busy}
            className="px-4 min-h-[44px] rounded-xl gradient-btn text-[12px] disabled:opacity-50"
          >
            {busy ? '…' : 'Install'}
          </button>
        )}
      </div>
    </Card>
  );
}
