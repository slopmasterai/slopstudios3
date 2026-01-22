import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Loader2,
  Search,
  Edit,
  Trash2,
  Eye,
  FileText,
  Copy,
  Tag,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useTemplates, useTemplate } from '@/hooks/useTemplates';
import { formatRelativeTime } from '@/lib/utils';
import type { AgentTemplate, TemplateVariable } from '@/types';

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  template: z.string().min(1, 'Template content is required'),
  tags: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

const variableSchema = z.object({
  name: z.string().min(1, 'Variable name is required'),
  type: z.enum(['string', 'number', 'boolean', 'array']),
  description: z.string().optional(),
  required: z.boolean().default(true),
  defaultValue: z.string().optional(),
});

type VariableFormData = z.infer<typeof variableSchema>;

// Template card component
function TemplateCard({
  template,
  onEdit,
  onDelete,
  onPreview,
}: {
  template: AgentTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {template.name}
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {template.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              <Tag className="mr-1 h-3 w-3" />
              {tag}
            </Badge>
          ))}
          {template.tags.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{template.tags.length - 4} more
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {template.variables.length} variable
          {template.variables.length !== 1 ? 's' : ''} | Updated{' '}
          {formatRelativeTime(template.updatedAt)}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onPreview}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Template editor dialog
function TemplateEditorDialog({
  template,
  open,
  onOpenChange,
  onSave,
  isLoading,
}: {
  template?: AgentTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: TemplateFormData, variables: TemplateVariable[]) => void;
  isLoading: boolean;
}) {
  const [variables, setVariables] = useState<TemplateVariable[]>(
    template?.variables ?? []
  );
  const [newVariable, setNewVariable] = useState<Partial<VariableFormData>>({
    type: 'string',
    required: true,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: template
      ? {
          name: template.name,
          description: template.description,
          template: template.template,
          tags: template.tags.join(', '),
        }
      : undefined,
  });

  const handleAddVariable = () => {
    if (newVariable.name && newVariable.type) {
      setVariables([
        ...variables,
        {
          name: newVariable.name,
          type: newVariable.type as TemplateVariable['type'],
          description: newVariable.description,
          required: newVariable.required ?? true,
          defaultValue: newVariable.defaultValue,
        },
      ]);
      setNewVariable({ type: 'string', required: true });
    }
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const onSubmit = (data: TemplateFormData) => {
    onSave(data, variables);
    reset();
    setVariables([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Template' : 'Create Template'}
          </DialogTitle>
          <DialogDescription>
            Define a reusable prompt template with variables
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Template name"
                {...register('name')}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="tag1, tag2, tag3"
                {...register('tags')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Brief description of the template"
              {...register('description')}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">
              Template Content (use {'{{variable}}'} for variables)
            </Label>
            <Textarea
              id="template"
              placeholder="You are a helpful assistant. Please help the user with {{task}}..."
              rows={6}
              className={`font-mono ${errors.template ? 'border-destructive' : ''}`}
              {...register('template')}
            />
            {errors.template && (
              <p className="text-sm text-destructive">
                {errors.template.message}
              </p>
            )}
          </div>

          {/* Variables */}
          <div className="space-y-3">
            <Label>Variables</Label>
            {variables.length > 0 && (
              <div className="space-y-2">
                {variables.map((variable, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <Badge variant="outline">{variable.type}</Badge>
                    <span className="font-mono text-sm">{variable.name}</span>
                    {variable.required && (
                      <Badge variant="secondary" className="text-xs">
                        required
                      </Badge>
                    )}
                    {variable.description && (
                      <span className="text-xs text-muted-foreground flex-1">
                        {variable.description}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveVariable(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add variable form */}
            <div className="grid gap-2 sm:grid-cols-4 border rounded-md p-3 bg-muted/50">
              <Input
                placeholder="Variable name"
                value={newVariable.name || ''}
                onChange={(e) =>
                  setNewVariable({ ...newVariable, name: e.target.value })
                }
              />
              <Select
                value={newVariable.type}
                onValueChange={(v) =>
                  setNewVariable({
                    ...newVariable,
                    type: v as VariableFormData['type'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="array">Array</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Description (optional)"
                value={newVariable.description || ''}
                onChange={(e) =>
                  setNewVariable({ ...newVariable, description: e.target.value })
                }
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddVariable}
                disabled={!newVariable.name}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {template ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Template preview dialog
function TemplatePreviewDialog({
  templateId,
  open,
  onOpenChange,
}: {
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: template, isLoading } = useTemplate(templateId);
  const { previewTemplate, isPreviewing, previewResult } = useTemplates();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const handlePreview = () => {
    if (template) {
      previewTemplate({ templateId, variables: variableValues });
    }
  };

  const handleCopy = () => {
    if (previewResult?.rendered) {
      navigator.clipboard.writeText(previewResult.rendered);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!template) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
          <DialogDescription>
            Enter values for variables to preview the rendered template
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {template.variables.length > 0 && (
            <div className="space-y-3">
              <Label>Variables</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {template.variables.map((variable) => (
                  <div key={variable.name} className="space-y-1">
                    <Label className="text-sm">
                      {variable.name}
                      {variable.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      placeholder={
                        variable.description || `Enter ${variable.name}`
                      }
                      value={variableValues[variable.name] || ''}
                      onChange={(e) =>
                        setVariableValues({
                          ...variableValues,
                          [variable.name]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Preview
          </Button>

          {previewResult?.rendered && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Rendered Template</Label>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
              <div className="rounded-md bg-muted p-4 font-mono text-sm whitespace-pre-wrap">
                {previewResult.rendered}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Templates() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | undefined>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreating,
    isUpdating,
  } = useTemplates();

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreate = () => {
    setSelectedTemplate(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setEditorOpen(true);
  };

  const handleDelete = (templateId: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      deleteTemplate(templateId);
    }
  };

  const handlePreview = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setPreviewOpen(true);
  };

  const handleSave = (data: TemplateFormData, variables: TemplateVariable[]) => {
    const templateData = {
      name: data.name,
      description: data.description,
      template: data.template,
      variables,
      tags: data.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? [],
    };

    if (selectedTemplate) {
      updateTemplate({ templateId: selectedTemplate.id, data: templateData });
    } else {
      createTemplate(templateData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">
            Manage reusable prompt templates for agents
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Spinner />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No templates found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'No templates match your search'
                : 'Get started by creating your first template'}
            </p>
            {!searchQuery && (
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => handleDelete(template.id)}
              onPreview={() => handlePreview(template.id)}
            />
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <TemplateEditorDialog
        template={selectedTemplate}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
        isLoading={isCreating || isUpdating}
      />

      {/* Preview Dialog */}
      {selectedTemplateId && (
        <TemplatePreviewDialog
          templateId={selectedTemplateId}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </div>
  );
}

export default Templates;
