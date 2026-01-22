import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Copy,
  Check,
  Heart,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

// Pattern categories
type PatternCategory = 'drums' | 'melodic' | 'bass' | 'effects' | 'advanced' | 'community';

interface Pattern {
  id: string;
  name: string;
  code: string;
  description: string;
  category: PatternCategory;
  tags: string[];
  author?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  favorited?: boolean;
}

// Built-in pattern library
const BUILTIN_PATTERNS: Pattern[] = [
  // Drums - Beginner
  {
    id: 'basic-beat',
    name: 'Basic Beat',
    code: 's("bd sd bd sd")',
    description: 'Simple kick and snare pattern',
    category: 'drums',
    tags: ['beginner', 'kick', 'snare'],
    difficulty: 'beginner',
  },
  {
    id: 'four-on-floor',
    name: 'Four on the Floor',
    code: 'stack(s("bd*4"), s("~ cp ~ cp"), s("hh*8"))',
    description: 'Classic house pattern',
    category: 'drums',
    tags: ['house', 'dance', 'classic'],
    difficulty: 'beginner',
  },
  {
    id: 'hihat-groove',
    name: 'Hi-Hat Groove',
    code: 's("hh*8").fast(2)',
    description: 'Fast hi-hat pattern',
    category: 'drums',
    tags: ['hihat', 'fast'],
    difficulty: 'beginner',
  },

  // Drums - Intermediate
  {
    id: 'breakbeat',
    name: 'Breakbeat',
    code: 's("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")',
    description: 'Syncopated breakbeat pattern',
    category: 'drums',
    tags: ['breakbeat', 'syncopated'],
    difficulty: 'intermediate',
  },
  {
    id: 'drum-fill',
    name: 'Drum Fill',
    code: 's("bd*2 sd*2 bd*3 sd*3")',
    description: 'Building drum fill',
    category: 'drums',
    tags: ['fill', 'buildup'],
    difficulty: 'intermediate',
  },
  {
    id: 'swing-beat',
    name: 'Swing Beat',
    code: 's("bd ~ sd ~").swing(0.2)',
    description: 'Swung drum pattern',
    category: 'drums',
    tags: ['swing', 'jazz'],
    difficulty: 'intermediate',
  },

  // Drums - Advanced
  {
    id: 'polyrhythm',
    name: 'Polyrhythm',
    code: 'stack(s("bd*3"), s("sd*5"), s("hh*7"))',
    description: 'Multiple rhythms layered (3 against 5 against 7)',
    category: 'drums',
    tags: ['polyrhythm', 'complex'],
    difficulty: 'advanced',
  },
  {
    id: 'euclidean-5-8',
    name: 'Euclidean (5,8)',
    code: 's("bd").euclid(5, 8)',
    description: 'Euclidean rhythm - 5 hits over 8 steps',
    category: 'drums',
    tags: ['euclidean', 'algorithmic'],
    difficulty: 'advanced',
  },
  {
    id: 'euclidean-7-16',
    name: 'Euclidean (7,16)',
    code: 's("bd").euclid(7, 16)',
    description: 'Euclidean rhythm - 7 hits over 16 steps',
    category: 'drums',
    tags: ['euclidean', 'algorithmic'],
    difficulty: 'advanced',
  },

  // Melodic
  {
    id: 'simple-melody',
    name: 'Simple Melody',
    code: 'note("c3 e3 g3 c4").s("casio")',
    description: 'Basic C major arpeggio',
    category: 'melodic',
    tags: ['melody', 'casio', 'major'],
    difficulty: 'beginner',
  },
  {
    id: 'melodic-arp',
    name: 'Melodic Arpeggio',
    code: 'note("c3 e3 g3 b3 c4 b3 g3 e3").s("pluck").lpf(2000)',
    description: 'Arpeggiated pluck melody with filter',
    category: 'melodic',
    tags: ['arpeggio', 'pluck', 'filter'],
    difficulty: 'intermediate',
  },
  {
    id: 'chord-progression',
    name: 'Chord Progression',
    code: 'note("<[c3,e3,g3] [f3,a3,c4] [g3,b3,d4] [c3,e3,g3]>").s("arpy")',
    description: 'I-IV-V-I chord progression',
    category: 'melodic',
    tags: ['chords', 'progression', 'harmony'],
    difficulty: 'intermediate',
  },
  {
    id: 'minor-scale',
    name: 'Minor Scale Run',
    code: 'note("a3 b3 c4 d4 e4 f4 g4 a4").s("sine")',
    description: 'A natural minor scale',
    category: 'melodic',
    tags: ['scale', 'minor', 'educational'],
    difficulty: 'beginner',
  },

  // Bass
  {
    id: 'simple-bass',
    name: 'Simple Bass',
    code: 'note("c2 ~ e2 ~, ~ g2 ~ a2").s("bass").lpf(800)',
    description: 'Basic bass line with filter',
    category: 'bass',
    tags: ['bass', 'simple'],
    difficulty: 'beginner',
  },
  {
    id: 'octave-bass',
    name: 'Octave Bass',
    code: 'note("c2 c3 c2 c3").s("bass").lpf(1000)',
    description: 'Octave jumping bass line',
    category: 'bass',
    tags: ['bass', 'octave'],
    difficulty: 'beginner',
  },
  {
    id: 'wobble-bass',
    name: 'Wobble Bass',
    code: 'note("c2").s("bass").lpf(sine.range(200, 2000).fast(4))',
    description: 'Dubstep-style wobble bass',
    category: 'bass',
    tags: ['bass', 'wobble', 'dubstep'],
    difficulty: 'advanced',
  },

  // Effects
  {
    id: 'reverb-drums',
    name: 'Reverb Drums',
    code: 's("bd sd:2 hh sd").room(0.8).size(0.9)',
    description: 'Drums with heavy room reverb',
    category: 'effects',
    tags: ['reverb', 'drums', 'ambient'],
    difficulty: 'beginner',
  },
  {
    id: 'delay-echo',
    name: 'Delay Echo',
    code: 's("cp*2").delay(0.5).delaytime(0.25).delayfeedback(0.6)',
    description: 'Clap with rhythmic delay',
    category: 'effects',
    tags: ['delay', 'echo', 'clap'],
    difficulty: 'intermediate',
  },
  {
    id: 'filter-sweep',
    name: 'Filter Sweep',
    code: 's("bd sd hh sd").lpf(sine.range(200, 4000).slow(4))',
    description: 'Low-pass filter sweeping up and down',
    category: 'effects',
    tags: ['filter', 'sweep', 'modulation'],
    difficulty: 'intermediate',
  },

  // Advanced
  {
    id: 'random-variation',
    name: 'Random Variation',
    code: 's("bd sd hh sd").sometimes(fast(2))',
    description: 'Pattern with random speed variations',
    category: 'advanced',
    tags: ['random', 'variation', 'generative'],
    difficulty: 'intermediate',
  },
  {
    id: 'probability',
    name: 'Probability Pattern',
    code: 's("bd? sd hh? sd")',
    description: 'Notes play with 50% probability',
    category: 'advanced',
    tags: ['probability', 'random', 'generative'],
    difficulty: 'intermediate',
  },
  {
    id: 'every-transform',
    name: 'Every Transform',
    code: 's("bd sd hh sd").every(4, rev)',
    description: 'Reverse every 4th cycle',
    category: 'advanced',
    tags: ['every', 'transform', 'variation'],
    difficulty: 'advanced',
  },
  {
    id: 'layered-complexity',
    name: 'Layered Complexity',
    code: `stack(
  s("bd*4").gain(0.9),
  s("~ cp ~ cp").room(0.3),
  s("hh*8").gain(0.4),
  note("c3 ~ e3 ~ g3 ~ e3 ~").s("bass").lpf(800)
)`,
    description: 'Full drum and bass arrangement',
    category: 'advanced',
    tags: ['layers', 'full', 'arrangement'],
    difficulty: 'advanced',
  },
];

interface PatternLibraryProps {
  onSelectPattern?: (pattern: Pattern) => void;
  className?: string;
}

/**
 * Browse, search, and select Strudel patterns
 */
export function PatternLibrary({
  onSelectPattern,
  className,
}: PatternLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PatternCategory | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [copiedPattern, setCopiedPattern] = useState<string | null>(null);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);

  // Filter patterns
  const filteredPatterns = useMemo(() => {
    let patterns = BUILTIN_PATTERNS;

    // Filter by favorites
    if (showFavoritesOnly) {
      patterns = patterns.filter((p) => favorites.has(p.id));
    }

    // Filter by category
    if (selectedCategory) {
      patterns = patterns.filter((p) => p.category === selectedCategory);
    }

    // Filter by difficulty
    if (selectedDifficulty) {
      patterns = patterns.filter((p) => p.difficulty === selectedDifficulty);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      patterns = patterns.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.code.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return patterns;
  }, [searchQuery, selectedCategory, selectedDifficulty, showFavoritesOnly, favorites]);

  // Toggle favorite
  const toggleFavorite = useCallback((patternId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(patternId)) {
        next.delete(patternId);
      } else {
        next.add(patternId);
      }
      return next;
    });
  }, []);

  // Copy pattern code
  const copyPattern = useCallback(async (pattern: Pattern) => {
    try {
      await navigator.clipboard.writeText(pattern.code);
      setCopiedPattern(pattern.id);
      setTimeout(() => setCopiedPattern(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  // Get difficulty badge variant
  const getDifficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'default';
      case 'intermediate':
        return 'secondary';
      case 'advanced':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // Category labels
  const categories: { value: PatternCategory; label: string }[] = [
    { value: 'drums', label: 'Drums' },
    { value: 'melodic', label: 'Melodic' },
    { value: 'bass', label: 'Bass' },
    { value: 'effects', label: 'Effects' },
    { value: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search patterns..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Favorites toggle */}
        <Button
          variant={showFavoritesOnly ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          <Heart className={cn('h-3 w-3 mr-1', showFavoritesOnly && 'fill-current')} />
          Favorites
        </Button>

        {/* Category filters */}
        <div className="flex gap-1">
          <Button
            variant={selectedCategory === null ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.value}
              variant={selectedCategory === cat.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Difficulty filters */}
        <div className="flex gap-1 ml-auto">
          {['beginner', 'intermediate', 'advanced'].map((diff) => (
            <Badge
              key={diff}
              variant={selectedDifficulty === diff ? getDifficultyVariant(diff) : 'outline'}
              className="cursor-pointer capitalize"
              onClick={() => setSelectedDifficulty(selectedDifficulty === diff ? null : diff)}
            >
              {diff}
            </Badge>
          ))}
        </div>
      </div>

      {/* Pattern list */}
      <div className="space-y-2 overflow-y-auto max-h-96">
        {filteredPatterns.map((pattern) => (
          <div
            key={pattern.id}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              'hover:bg-accent cursor-pointer'
            )}
            onClick={() => onSelectPattern?.(pattern)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">{pattern.name}</h4>
                  <Badge variant={getDifficultyVariant(pattern.difficulty)} className="text-xs">
                    {pattern.difficulty}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {pattern.description}
                </p>

                {/* Code preview */}
                <div
                  className={cn(
                    'bg-muted rounded-md p-2 font-mono text-xs',
                    expandedPattern === pattern.id ? '' : 'max-h-12 overflow-hidden'
                  )}
                >
                  <pre className="whitespace-pre-wrap">{pattern.code}</pre>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {pattern.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      <Tag className="h-2 w-2 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(pattern.id);
                  }}
                  title={favorites.has(pattern.id) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart
                    className={cn(
                      'h-4 w-4',
                      favorites.has(pattern.id) && 'fill-red-500 text-red-500'
                    )}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyPattern(pattern);
                  }}
                  title="Copy code"
                >
                  {copiedPattern === pattern.id ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPattern(expandedPattern === pattern.id ? null : pattern.id);
                  }}
                  title={expandedPattern === pattern.id ? 'Collapse' : 'Expand'}
                >
                  {expandedPattern === pattern.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}

        {filteredPatterns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No patterns found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filteredPatterns.length} pattern{filteredPatterns.length !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Click to use, copy to clipboard
        </span>
      </div>
    </div>
  );
}

export default PatternLibrary;
