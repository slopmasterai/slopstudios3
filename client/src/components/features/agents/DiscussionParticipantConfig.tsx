import { useState, useEffect } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import type { Agent } from '@/types';
import type { ConsensusStrategy, DiscussionConfig } from '@backend/types/agent.types';

// Role presets for common discussion scenarios
const ROLE_PRESETS = [
  { label: 'Critic', value: 'critic', description: 'Challenges assumptions and identifies weaknesses' },
  { label: 'Supporter', value: 'supporter', description: 'Identifies strengths and positive aspects' },
  { label: 'Expert', value: 'expert', description: 'Provides domain-specific knowledge' },
  { label: 'Mediator', value: 'mediator', description: 'Helps find common ground' },
  { label: 'Devil\'s Advocate', value: 'devils-advocate', description: 'Argues opposing viewpoints' },
  { label: 'Analyst', value: 'analyst', description: 'Breaks down complex issues' },
  { label: 'Creative', value: 'creative', description: 'Proposes novel solutions' },
  { label: 'Pragmatist', value: 'pragmatist', description: 'Focuses on practical implementation' },
] as const;

const CONSENSUS_STRATEGIES: { value: ConsensusStrategy; label: string; description: string }[] = [
  { value: 'unanimous', label: 'Unanimous', description: 'All participants must agree' },
  { value: 'majority', label: 'Majority', description: 'More than 50% must agree' },
  { value: 'weighted', label: 'Weighted', description: 'Votes are weighted by participant weight' },
  { value: 'facilitator', label: 'Facilitator', description: 'A designated agent synthesizes the consensus' },
];

interface ParticipantFormData {
  id: string;
  agentId: string;
  role: string;
  weight: number;
  perspective: string;
}

interface DiscussionParticipantConfigProps {
  agents: Agent[];
  value?: Partial<DiscussionConfig>;
  onChange: (config: DiscussionConfig) => void;
  disabled?: boolean;
}

export function DiscussionParticipantConfig({
  agents,
  value,
  onChange,
  disabled = false,
}: DiscussionParticipantConfigProps) {
  const [participants, setParticipants] = useState<ParticipantFormData[]>(
    value?.participants?.map((p, i) => ({
      id: p.id || `participant-${i}`,
      agentId: p.agentId,
      role: p.role,
      weight: p.weight ?? 1,
      perspective: p.perspective ?? '',
    })) ?? []
  );
  const [maxRounds, setMaxRounds] = useState(value?.maxRounds ?? 5);
  const [consensusStrategy, setConsensusStrategy] = useState<ConsensusStrategy>(
    value?.consensusStrategy ?? 'majority'
  );
  const [convergenceThreshold, setConvergenceThreshold] = useState(
    value?.convergenceThreshold ?? 0.8
  );
  const [facilitatorAgentId, setFacilitatorAgentId] = useState(
    value?.facilitatorAgentId ?? ''
  );

  // Use effect to emit config changes with fresh state
  useEffect(() => {
    const config: DiscussionConfig = {
      maxRounds,
      participants: participants.map((p) => ({
        id: p.id,
        agentId: p.agentId,
        role: p.role,
        weight: p.weight,
        perspective: p.perspective || undefined,
      })),
      consensusStrategy,
      convergenceThreshold,
      facilitatorAgentId: consensusStrategy === 'facilitator' ? facilitatorAgentId : undefined,
    };
    onChange(config);
  }, [participants, maxRounds, consensusStrategy, convergenceThreshold, facilitatorAgentId, onChange]);

  const addParticipant = () => {
    if (participants.length >= 10) return;
    const newParticipant: ParticipantFormData = {
      id: `participant-${Date.now()}`,
      agentId: agents[0]?.id ?? '',
      role: 'expert',
      weight: 1,
      perspective: '',
    };
    setParticipants([...participants, newParticipant]);
  };

  const removeParticipant = (id: string) => {
    if (participants.length <= 2) return;
    setParticipants(participants.filter((p) => p.id !== id));
  };

  const updateParticipant = (id: string, field: keyof ParticipantFormData, value: unknown) => {
    setParticipants(
      participants.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleMaxRoundsChange = (value: number) => {
    setMaxRounds(Math.max(1, Math.min(10, value)));
  };

  const handleConsensusStrategyChange = (value: ConsensusStrategy) => {
    setConsensusStrategy(value);
  };

  const handleConvergenceThresholdChange = (value: number) => {
    setConvergenceThreshold(Math.max(0, Math.min(1, value)));
  };

  const handleFacilitatorChange = (value: string) => {
    setFacilitatorAgentId(value);
  };

  const isValid = participants.length >= 2 && participants.every((p) => p.agentId && p.role);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Discussion Configuration
        </CardTitle>
        <CardDescription>
          Configure participants and consensus settings for the discussion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Discussion Settings */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="maxRounds">Max Rounds</Label>
            <Input
              id="maxRounds"
              type="number"
              min={1}
              max={10}
              value={maxRounds}
              onChange={(e) => handleMaxRoundsChange(parseInt(e.target.value) || 1)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum discussion rounds (1-10)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="consensusStrategy">Consensus Strategy</Label>
            <Select
              value={consensusStrategy}
              onValueChange={(v) => handleConsensusStrategyChange(v as ConsensusStrategy)}
              disabled={disabled}
            >
              <SelectTrigger id="consensusStrategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENSUS_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy.value} value={strategy.value}>
                    <div className="flex flex-col">
                      <span>{strategy.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {strategy.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="convergenceThreshold">Convergence Threshold</Label>
            <Input
              id="convergenceThreshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={convergenceThreshold}
              onChange={(e) =>
                handleConvergenceThresholdChange(parseFloat(e.target.value) || 0.8)
              }
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Agreement score to achieve (0-1)
            </p>
          </div>
        </div>

        {/* Facilitator Selection (for facilitator strategy) */}
        {consensusStrategy === 'facilitator' && (
          <div className="space-y-2">
            <Label htmlFor="facilitator">Facilitator Agent</Label>
            <Select
              value={facilitatorAgentId}
              onValueChange={handleFacilitatorChange}
              disabled={disabled}
            >
              <SelectTrigger id="facilitator">
                <SelectValue placeholder="Select a facilitator agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This agent will synthesize participant contributions into consensus
            </p>
          </div>
        )}

        {/* Participants */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>
              Participants ({participants.length}/10)
              {participants.length < 2 && (
                <span className="ml-2 text-destructive">Minimum 2 required</span>
              )}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={addParticipant}
              disabled={disabled || participants.length >= 10}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Participant
            </Button>
          </div>

          <div className="space-y-3">
            {participants.map((participant, index) => (
              <Card key={participant.id} className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Badge variant="outline" className="mt-1">
                      #{index + 1}
                    </Badge>
                    <div className="flex-1 space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        {/* Agent Selection */}
                        <div className="space-y-2">
                          <Label>Agent</Label>
                          <Select
                            value={participant.agentId}
                            onValueChange={(v) =>
                              updateParticipant(participant.id, 'agentId', v)
                            }
                            disabled={disabled}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select agent" />
                            </SelectTrigger>
                            <SelectContent>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                  {agent.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Role Selection */}
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <Select
                            value={participant.role}
                            onValueChange={(v) =>
                              updateParticipant(participant.id, 'role', v)
                            }
                            disabled={disabled}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_PRESETS.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  <div className="flex flex-col">
                                    <span>{role.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {role.description}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Weight (for weighted consensus) */}
                        {consensusStrategy === 'weighted' && (
                          <div className="space-y-2">
                            <Label>Weight</Label>
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step={0.1}
                              value={participant.weight}
                              onChange={(e) =>
                                updateParticipant(
                                  participant.id,
                                  'weight',
                                  parseFloat(e.target.value) || 1
                                )
                              }
                              disabled={disabled}
                            />
                          </div>
                        )}
                      </div>

                      {/* Perspective */}
                      <div className="space-y-2">
                        <Label>Perspective (Optional)</Label>
                        <Textarea
                          placeholder="Specific viewpoint or system prompt for this participant..."
                          rows={2}
                          value={participant.perspective}
                          onChange={(e) =>
                            updateParticipant(participant.id, 'perspective', e.target.value)
                          }
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParticipant(participant.id)}
                      disabled={disabled || participants.length <= 2}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Validation Status */}
        {!isValid && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Please configure at least 2 participants with agents and roles selected.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DiscussionParticipantConfig;
