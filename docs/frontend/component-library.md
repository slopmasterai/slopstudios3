# Component Library Guide

## Overview

The Slop Studios 3 frontend uses a custom component library built on Radix UI primitives with Tailwind CSS styling. Components are located in `client/src/components/ui/`.

## Design Principles

1. **Accessibility First** - Built on Radix UI for WCAG compliance
2. **Composable** - Components can be combined and extended
3. **Consistent** - Follows a unified design language
4. **Themeable** - Supports light and dark modes via CSS variables

## Component Catalog

### Button

Interactive button component with variants.

```tsx
import { Button } from '@/components/ui/Button';

// Variants
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// States
<Button disabled>Disabled</Button>
<Button asChild><Link to="/path">As Link</Link></Button>
```

### Input

Text input with label and error support.

```tsx
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="you@example.com"
    className="border-destructive" // Error state
  />
  <p className="text-sm text-destructive">Error message</p>
</div>
```

### Textarea

Multi-line text input.

```tsx
import { Textarea } from '@/components/ui/Textarea';

<Textarea
  placeholder="Enter your message..."
  rows={6}
  className="font-mono" // Code input
/>
```

### Card

Container component with sections.

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>
    Main content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Dialog

Modal dialog component.

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Content here</div>
    <DialogFooter>
      <Button>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Dropdown Menu

Contextual menu component.

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/Dropdown';

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost">Options</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Tabs

Tab navigation component.

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

### Badge

Status indicator component.

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

### Alert

Alert message component.

```tsx
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';

<Alert>
  <AlertTitle>Information</AlertTitle>
  <AlertDescription>This is an informational message.</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>
```

### Progress

Progress indicator component.

```tsx
import { Progress } from '@/components/ui/Progress';

<Progress value={75} className="h-2" />
```

### Spinner

Loading spinner component.

```tsx
import { Spinner } from '@/components/ui/Spinner';

<Spinner />
<Spinner size="sm" />
<Spinner size="lg" />
```

### Select

Selection dropdown component.

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';

<Select onValueChange={(value) => console.log(value)}>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Checkbox

Checkbox input component.

```tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';

<div className="flex items-center gap-2">
  <Checkbox id="terms" />
  <Label htmlFor="terms">Accept terms and conditions</Label>
</div>
```

### Switch

Toggle switch component.

```tsx
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';

<div className="flex items-center gap-2">
  <Switch id="notifications" />
  <Label htmlFor="notifications">Enable notifications</Label>
</div>
```

## Styling Patterns

### Using cn() for Conditional Classes

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  variant === "primary" && "primary-classes"
)} />
```

### Responsive Design

```tsx
// Mobile-first approach
<div className="p-4 md:p-6 lg:p-8">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {/* Content */}
  </div>
</div>
```

### Dark Mode

Components automatically adapt to dark mode via CSS variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

## Creating New Components

1. Create file in `components/ui/`
2. Use Radix UI primitive if available
3. Style with Tailwind and CVA for variants
4. Export from `components/ui/index.ts`

Example:

```tsx
// components/ui/MyComponent.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const myComponentVariants = cva(
  "base-styles",
  {
    variants: {
      variant: {
        default: "default-styles",
        secondary: "secondary-styles",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface MyComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof myComponentVariants> {}

const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(myComponentVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
MyComponent.displayName = 'MyComponent';

export { MyComponent, myComponentVariants };
```

## Agent Collaboration Components

The agent collaboration components provide real-time visualization for Discussion and Self-Critique workflows.

### DiscussionPanel

Main panel for displaying real-time discussion between multiple agents.

```tsx
import { DiscussionPanel } from '@/components/features/agents';

<DiscussionPanel
  executionId={workflowId}        // WebSocket execution ID
  topic="Should we use microservices?"  // Discussion topic
  maxRounds={5}                   // Maximum rounds
  onExport={(result) => {}}       // Callback when exporting
/>
```

Features:
- Real-time message streaming via WebSocket
- Auto-scroll to latest contributions
- Round progress visualization
- Consensus score tracking
- Export to JSON or Markdown
- Copy final consensus to clipboard

### SelfCritiquePanel

Panel for visualizing iterative self-improvement of agent outputs.

```tsx
import { SelfCritiquePanel } from '@/components/features/agents';

<SelfCritiquePanel
  executionId={workflowId}        // WebSocket execution ID
  maxIterations={5}               // Maximum iterations
  onExport={(result) => {}}       // Callback when exporting
/>
```

Features:
- Real-time iteration tracking
- Quality score visualization per criterion
- Score trend chart
- Side-by-side original vs final output comparison
- Quality improvement metrics

### DiscussionParticipantConfig

Form for configuring discussion participants and settings.

```tsx
import { DiscussionParticipantConfig } from '@/components/features/agents';

<DiscussionParticipantConfig
  agents={agentsList}                    // Available agents
  value={existingConfig}                 // Initial config (optional)
  onChange={(config) => setConfig(config)}  // Config change handler
  disabled={isRunning}                   // Disable during execution
/>
```

Features:
- Add/remove participants (2-10)
- Role selection with presets (Critic, Supporter, Expert, etc.)
- Weight configuration for weighted consensus
- Perspective/system prompt per participant
- Consensus strategy selection
- Convergence threshold setting

### DiscussionMessage

Chat message component for participant contributions.

```tsx
import { DiscussionMessage, SynthesisMessage } from '@/components/features/agents';

// Regular contribution
<DiscussionMessage
  contribution={contributionData}
  showTimestamp={true}
/>

// Synthesis message (styled differently)
<SynthesisMessage
  synthesis="Synthesized consensus text..."
  consensusScore={0.85}
  timestamp={isoString}
/>
```

### DiscussionRound

Component for displaying a complete discussion round.

```tsx
import { DiscussionRound, ActiveRound } from '@/components/features/agents';

// Completed round (collapsible)
<DiscussionRound
  round={roundData}
  isCompleted={true}
  defaultExpanded={false}
/>

// Active round (streaming)
<ActiveRound
  roundNumber={3}
  contributions={currentContributions}
  participantCount={4}
/>
```

### DiscussionMetrics

Display metrics for discussion and self-critique workflows.

```tsx
import {
  DiscussionMetrics,
  SelfCritiqueMetrics,
  CollaborationMetrics
} from '@/components/features/agents';

// Discussion only
<DiscussionMetrics />

// Self-critique only
<SelfCritiqueMetrics />

// Both combined
<CollaborationMetrics />
```

Displays:
- Total executions
- Average rounds/iterations
- Convergence rate
- Consensus/quality scores
- Average duration

## WebSocket Hooks

### useDiscussionStream

Hook for subscribing to discussion WebSocket events.

```tsx
import { useDiscussionStream } from '@/hooks/useAgents';

const {
  status,               // 'idle' | 'running' | 'converged' | 'completed' | 'error'
  rounds,               // Completed rounds
  currentRound,         // Current round number
  participantCount,     // Number of participants
  currentContributions, // Contributions in current round
  consensusScore,       // Current consensus score (0-1)
  converged,            // Whether consensus was reached
  result,               // Final DiscussionResult
  error,                // Error message if any
  isRunning,
  isCompleted,
  isConverged,
  hasError,
} = useDiscussionStream(executionId);
```

### useSelfCritiqueStream

Hook for subscribing to self-critique WebSocket events.

```tsx
import { useSelfCritiqueStream } from '@/hooks/useAgents';

const {
  status,               // 'idle' | 'running' | 'converged' | 'completed' | 'error'
  iterations,           // All iterations
  currentIteration,     // Current iteration number
  currentScore,         // Current quality score (0-1)
  criteriaScores,       // Scores per criterion
  feedback,             // Current feedback text
  converged,            // Whether quality threshold was met
  result,               // Final SelfCritiqueResult
  error,                // Error message if any
  isRunning,
  isCompleted,
  isConverged,
  hasError,
} = useSelfCritiqueStream(executionId);
```

## Common Discussion Configurations

### Debate Configuration

```tsx
const debateConfig: DiscussionConfig = {
  maxRounds: 5,
  participants: [
    { agentId: 'agent-1', role: 'supporter', weight: 1 },
    { agentId: 'agent-2', role: 'critic', weight: 1 },
    { agentId: 'agent-3', role: 'mediator', weight: 1.5 },
  ],
  consensusStrategy: 'weighted',
  convergenceThreshold: 0.75,
};
```

### Expert Panel Configuration

```tsx
const expertPanelConfig: DiscussionConfig = {
  maxRounds: 3,
  participants: [
    { agentId: 'agent-1', role: 'expert', perspective: 'Focus on technical feasibility' },
    { agentId: 'agent-2', role: 'expert', perspective: 'Focus on user experience' },
    { agentId: 'agent-3', role: 'analyst', perspective: 'Focus on cost analysis' },
  ],
  consensusStrategy: 'facilitator',
  facilitatorAgentId: 'agent-4',
  convergenceThreshold: 0.8,
};
```

### Unanimous Decision Configuration

```tsx
const unanimousConfig: DiscussionConfig = {
  maxRounds: 10,
  participants: [
    { agentId: 'agent-1', role: 'pragmatist' },
    { agentId: 'agent-2', role: 'creative' },
  ],
  consensusStrategy: 'unanimous',
  convergenceThreshold: 1.0,
};
```
