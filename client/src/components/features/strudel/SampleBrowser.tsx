import { useState, useMemo, useCallback } from 'react';
import { Search, Play, Square, Copy, Check, Volume2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

// Dirt-Samples categories organized by type
const SAMPLE_CATEGORIES = {
  drums: {
    label: 'Drums',
    samples: [
      { name: 'bd', description: 'Bass drum', count: 24 },
      { name: 'sd', description: 'Snare drum', count: 52 },
      { name: 'hh', description: 'Hi-hat', count: 27 },
      { name: 'cp', description: 'Clap', count: 2 },
      { name: 'hh27', description: 'Open hi-hat', count: 13 },
      { name: 'cr', description: 'Crash cymbal', count: 6 },
      { name: 'perc', description: 'Percussion', count: 56 },
      { name: 'tabla', description: 'Tabla drums', count: 26 },
      { name: 'hand', description: 'Hand drums', count: 17 },
      { name: 'rm', description: 'Rim shot', count: 2 },
    ],
  },
  machines: {
    label: 'Drum Machines',
    samples: [
      { name: '808', description: 'TR-808', count: 6 },
      { name: '809', description: 'TR-909', count: 6 },
      { name: '808bd', description: '808 Bass drum', count: 25 },
      { name: '808sd', description: '808 Snare', count: 25 },
      { name: '808hc', description: '808 Hi-hat closed', count: 5 },
      { name: '808oh', description: '808 Hi-hat open', count: 4 },
      { name: 'clubkick', description: 'Club kicks', count: 5 },
      { name: 'drumtraks', description: 'DrumTraks', count: 13 },
    ],
  },
  bass: {
    label: 'Bass',
    samples: [
      { name: 'bass', description: 'Bass sounds', count: 4 },
      { name: 'bass0', description: 'Bass set 0', count: 3 },
      { name: 'bass1', description: 'Bass set 1', count: 30 },
      { name: 'bass2', description: 'Bass set 2', count: 5 },
      { name: 'bass3', description: 'Bass set 3', count: 11 },
      { name: 'jvbass', description: 'JV bass', count: 13 },
      { name: 'jungbass', description: 'Jungle bass', count: 20 },
      { name: 'wobble', description: 'Wobble bass', count: 1 },
    ],
  },
  melodic: {
    label: 'Melodic',
    samples: [
      { name: 'casio', description: 'Casio keyboard (use for piano)', count: 3 },
      { name: 'superpiano', description: 'Piano', count: 1 },
      { name: 'arpy', description: 'Arpeggiated', count: 11 },
      { name: 'pluck', description: 'Plucked sounds', count: 17 },
      { name: 'sitar', description: 'Sitar', count: 8 },
      { name: 'gtr', description: 'Guitar', count: 3 },
      { name: 'jazz', description: 'Jazz samples', count: 8 },
      { name: 'pad', description: 'Pad sounds', count: 4 },
    ],
  },
  synth: {
    label: 'Synth',
    samples: [
      { name: 'sine', description: 'Sine wave', count: 6 },
      { name: 'saw', description: 'Saw wave', count: 2 },
      { name: 'moog', description: 'Moog synth', count: 7 },
      { name: 'juno', description: 'Juno synth', count: 12 },
      { name: 'hoover', description: 'Hoover sound', count: 6 },
      { name: 'stab', description: 'Stab sounds', count: 23 },
      { name: 'blip', description: 'Blip sounds', count: 2 },
      { name: 'bleep', description: 'Bleep sounds', count: 13 },
    ],
  },
  effects: {
    label: 'Effects',
    samples: [
      { name: 'noise', description: 'Noise', count: 2 },
      { name: 'metal', description: 'Metal sounds', count: 10 },
      { name: 'industrial', description: 'Industrial', count: 32 },
      { name: 'glitch', description: 'Glitch sounds', count: 8 },
      { name: 'space', description: 'Space sounds', count: 18 },
      { name: 'fire', description: 'Fire sounds', count: 1 },
      { name: 'wind', description: 'Wind sounds', count: 10 },
    ],
  },
  voice: {
    label: 'Voice',
    samples: [
      { name: 'speech', description: 'Speech', count: 7 },
      { name: 'mouth', description: 'Mouth sounds', count: 15 },
      { name: 'moan', description: 'Vocal sounds', count: 1 },
      { name: 'yeah', description: 'Yeah vocals', count: 1 },
      { name: 'hmm', description: 'Hmm sounds', count: 1 },
      { name: 'numbers', description: 'Number vocals', count: 9 },
      { name: 'alphabet', description: 'Alphabet', count: 26 },
    ],
  },
  nature: {
    label: 'Nature',
    samples: [
      { name: 'birds', description: 'Bird sounds', count: 10 },
      { name: 'insect', description: 'Insect sounds', count: 3 },
      { name: 'crow', description: 'Crow sounds', count: 4 },
      { name: 'bubble', description: 'Bubble sounds', count: 8 },
      { name: 'breath', description: 'Breath sounds', count: 1 },
    ],
  },
};

interface SampleBrowserProps {
  onSelectSample?: (sampleName: string) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Browse and preview Dirt-Samples categories
 * Click to preview, double-click to insert into pattern
 */
export function SampleBrowser({
  onSelectSample,
  className,
  compact = false,
}: SampleBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const [copiedSample, setCopiedSample] = useState<string | null>(null);

  // Filter samples based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return SAMPLE_CATEGORIES;
    }

    const query = searchQuery.toLowerCase();
    const filtered: Partial<typeof SAMPLE_CATEGORIES> = {};

    for (const [key, category] of Object.entries(SAMPLE_CATEGORIES)) {
      const matchingSamples = category.samples.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      );

      if (matchingSamples.length > 0) {
        filtered[key as keyof typeof SAMPLE_CATEGORIES] = {
          ...category,
          samples: matchingSamples,
        };
      }
    }

    return filtered;
  }, [searchQuery]);

  // Preview a sample using Superdough
  const previewSample = useCallback(async (sampleName: string) => {
    if (playingSample === sampleName) {
      setPlayingSample(null);
      return;
    }

    setPlayingSample(sampleName);

    try {
      // Dynamic import to avoid loading Superdough until needed
      const { samples, superdough, getAudioContext, initAudioOnFirstClick } = await import('superdough');

      // Initialize audio on first interaction
      await initAudioOnFirstClick();

      // Load samples if not already loaded
      await samples('github:tidalcycles/dirt-samples');

      // Get the audio context
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Play the sample
      await superdough({ s: sampleName, n: 0, gain: 0.8 }, ctx.currentTime, 0.5, 0.5, 0.8);

      // Reset playing state after sample duration
      setTimeout(() => {
        setPlayingSample(null);
      }, 500);
    } catch (error) {
      console.error('Failed to preview sample:', error);
      setPlayingSample(null);
    }
  }, [playingSample]);

  // Copy sample name to clipboard
  const copySampleName = useCallback(async (sampleName: string) => {
    try {
      await navigator.clipboard.writeText(`s("${sampleName}")`);
      setCopiedSample(sampleName);
      setTimeout(() => setCopiedSample(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  // Handle sample selection
  const handleSelectSample = useCallback((sampleName: string) => {
    onSelectSample?.(sampleName);
  }, [onSelectSample]);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search samples..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        <Button
          variant={selectedCategory === null ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          All
        </Button>
        {Object.entries(SAMPLE_CATEGORIES).map(([key, category]) => (
          <Button
            key={key}
            variant={selectedCategory === key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedCategory(key)}
          >
            {category.label}
          </Button>
        ))}
      </div>

      {/* Sample list */}
      <div className={cn('space-y-4 overflow-y-auto', compact ? 'max-h-64' : 'max-h-96')}>
        {Object.entries(filteredCategories)
          .filter(([key]) => selectedCategory === null || key === selectedCategory)
          .map(([key, category]) => (
            <div key={key}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {category.label}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {category.samples.map((sample) => (
                  <div
                    key={sample.name}
                    className={cn(
                      'flex items-center justify-between rounded-md border p-2 transition-colors',
                      'hover:bg-accent cursor-pointer',
                      playingSample === sample.name && 'border-primary bg-primary/10'
                    )}
                    onClick={() => handleSelectSample(sample.name)}
                    onDoubleClick={() => previewSample(sample.name)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">{sample.name}</code>
                        <Badge variant="outline" className="text-xs">
                          {sample.count}
                        </Badge>
                      </div>
                      {!compact && (
                        <p className="text-xs text-muted-foreground truncate">
                          {sample.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          previewSample(sample.name);
                        }}
                        title="Preview sample"
                      >
                        {playingSample === sample.name ? (
                          <Square className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          copySampleName(sample.name);
                        }}
                        title="Copy to clipboard"
                      >
                        {copiedSample === sample.name ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Info footer */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Volume2 className="h-3 w-3" />
        <span>Double-click to preview, click copy button to use in pattern</span>
      </div>
    </div>
  );
}

export default SampleBrowser;
