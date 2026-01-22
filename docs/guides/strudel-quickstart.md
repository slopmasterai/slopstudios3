# Strudel Quick Start Guide

Get started with Strudel live coding music in 5 minutes.

## What is Strudel?

Strudel is a live coding language for making music. It lets you create beats, melodies, and soundscapes using simple text patterns that update in real-time.

## Quick Start

### 1. Open the Strudel Page

Navigate to the Strudel Studio in the application.

### 2. Write Your First Pattern

Type in the pattern editor:

```javascript
s("bd sd hh sd")
```

This creates a pattern with:
- `bd` - bass drum
- `sd` - snare drum
- `hh` - hi-hat

### 3. Click "Live Play"

Click the big "Live Play" button (or press `Ctrl+Enter`). You should hear a basic beat!

### 4. Experiment

Try changing the pattern while it's playing:

```javascript
s("bd*4 sd*2 hh*8")
```

The `*` multiplies events - `bd*4` means four bass drums.

## Basic Syntax

### Sound Selection

```javascript
s("bd")          // Bass drum
s("sd")          // Snare drum
s("hh")          // Hi-hat
s("cp")          // Clap
s("808")         // 808 drum machine sounds
s("piano")       // Piano
s("bass")        // Bass
```

### Patterns

```javascript
// Sequence - play one after another
s("bd sd hh sd")

// Multiply - repeat events
s("bd*4")        // Four bass drums

// Rest - silence
s("bd ~ sd ~")   // bd, rest, sd, rest

// Group - subdivide time
s("[bd sd] hh")  // bd and sd share first half

// Speed up
s("bd sd").fast(2)

// Slow down
s("bd sd").slow(2)
```

### Notes and Melodies

```javascript
// Play notes
note("c3 e3 g3 c4")

// With a sound
note("c3 e3 g3 c4").sound("piano")

// Chords
note("[c3,e3,g3]")

// Sequences of chords
note("<[c3,e3,g3] [f3,a3,c4] [g3,b3,d4]>")
```

### Effects

```javascript
// Volume (0-1)
s("bd sd").gain(0.5)

// Panning (0=left, 0.5=center, 1=right)
s("bd sd").pan(0.2)

// Reverb
s("bd sd").room(0.5).size(0.8)

// Delay
s("bd sd").delay(0.5).delaytime(0.25)

// Low-pass filter
s("bd sd").lpf(800)

// High-pass filter
s("bd sd").hpf(200)
```

### Layering

```javascript
// Stack patterns on top of each other
stack(
  s("bd*4"),
  s("~ cp ~ cp"),
  s("hh*8").gain(0.5)
)
```

## Common Patterns

### Four on the Floor

```javascript
stack(
  s("bd*4"),
  s("~ cp ~ cp"),
  s("hh*8")
)
```

### Breakbeat

```javascript
s("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")
```

### Polyrhythm

```javascript
stack(
  s("bd*3"),
  s("sd*5"),
  s("hh*7")
)
```

### Euclidean Rhythm

```javascript
s("bd").euclid(5, 8)  // 5 hits spread over 8 slots
```

### Arpeggiated Melody

```javascript
note("c3 e3 g3 b3 c4 b3 g3 e3")
  .sound("piano")
  .lpf(2000)
```

### Bass Line

```javascript
note("c2 ~ e2 ~, ~ g2 ~ a2")
  .sound("bass")
  .lpf(800)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Play/Update pattern |
| `Ctrl+.` | Stop playback |
| `Escape` | Stop playback |

## Sample Library

Strudel has 220+ sample categories from the Dirt-Samples library:

### Drums
`bd`, `sd`, `hh`, `cp`, `808`, `909`, `perc`, `tabla`

### Bass
`bass`, `bass0`, `bass1`, `jvbass`, `jungbass`

### Melodic
`piano`, `arpy`, `pluck`, `casio`, `sine`, `saw`

### Effects
`noise`, `metal`, `industrial`, `space`

### Other
`birds`, `wind`, `coins`, `mouth`, `speech`

To hear a category:
```javascript
s("bd")      // Bass drum variations
s("bd:0")    // First bass drum sample
s("bd:1")    // Second bass drum sample
s("bd:2")    // Third bass drum sample
```

## Tips for Beginners

1. **Start simple** - Begin with `s("bd sd hh sd")` and build up
2. **Use examples** - Click the example patterns to see how they work
3. **Experiment while playing** - Change patterns live with `Ctrl+Enter`
4. **Listen to effects** - Add `.room(0.5)` to hear reverb
5. **Layer sounds** - Use `stack()` to combine patterns

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting quotes | `s("bd")` not `s(bd)` |
| Wrong brackets | `s("[bd sd]")` for groups |
| Missing sound | `note("c3").sound("piano")` |

## Next Steps

1. **Explore patterns** - Try all the example patterns in the UI
2. **Learn mini-notation** - The `"[a b] c"` syntax for complex rhythms
3. **Add effects** - Experiment with reverb, delay, filters
4. **Export your work** - Use "Export WAV" to download your creations

## Resources

- [Strudel Documentation](https://strudel.cc/learn)
- [Approach Selection Guide](./strudel-approach-selection.md)
- [Migration Guide](./strudel-migration-guide.md)
- [Frontend Playback Guide](../frontend/strudel-realtime-playback.md)
