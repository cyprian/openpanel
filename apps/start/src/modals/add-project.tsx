import { zodResolver } from '@hookform/resolvers/zod';
import { zOnboardingProject } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  MonitorIcon,
  NetworkIcon,
  SaveIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

const validator = zOnboardingProject;
type IForm = z.infer<typeof validator>;

function downloadCredentials(client: { id: string; secret: string }) {
  const blob = new Blob(
    [`CLIENT_ID=${client.id}\nCLIENT_SECRET=${client.secret}`],
    { type: 'text/plain' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'credentials.txt';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AddProject() {
  const { organizationId } = useAppParams();
  const navigate = useNavigate();
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      organizationId,
      timezone: '', // Not used
      project: '',
      domain: '',
      cors: [],
      website: false,
      app: false,
      backend: false,
      ml: false,
    },
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.create.mutationOptions({
      onError: handleError,
      onSuccess: (res) => {
        queryClient.invalidateQueries(
          trpc.project.list.queryFilter({ organizationId })
        );
        popModal();
        navigate({
          to: res.types.includes('ml')
            ? '/$organizationId/$projectId/ml'
            : '/$organizationId/$projectId',
          params: {
            organizationId,
            projectId: res.id,
          },
        });
        toast.success('Project created', {
          description: `${res.name}`,
          action: res.client
            ? {
                label: 'Save credentials',
                onClick: () => downloadCredentials(res.client!),
              }
            : undefined,
        });
      },
    })
  );

  const onSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const isWebsite = useWatch({
    name: 'website',
    control: form.control,
  });

  const isApp = useWatch({
    name: 'app',
    control: form.control,
  });

  const isBackend = useWatch({
    name: 'backend',
    control: form.control,
  });

  const isMl = useWatch({
    name: 'ml',
    control: form.control,
  });

  useEffect(() => {
    if (!isWebsite) {
      form.setValue('domain', null);
      form.setValue('cors', []);
    }
  }, [isWebsite, form]);

  useEffect(() => {
    form.clearErrors();
  }, [isWebsite, isApp, isBackend, isMl]);

  const trackingOptions = [
    {
      key: 'website' as const,
      label: 'Website',
      description: 'Track events and conversion for your website',
      Icon: MonitorIcon,
      active: isWebsite,
      disabled: isApp || isMl,
    },
    {
      key: 'app' as const,
      label: 'App',
      description: 'Track events and conversion for your app',
      Icon: SmartphoneIcon,
      active: isApp,
      disabled: isWebsite || isMl,
    },
    {
      key: 'backend' as const,
      label: 'Backend / API',
      description: 'Track events and conversion for your backend / API',
      Icon: ServerIcon,
      active: isBackend,
      disabled: isMl,
    },
    {
      key: 'ml' as const,
      label: 'ML',
      description: 'Track machine learning experiments, runs, metrics, and artifacts',
      Icon: NetworkIcon,
      active: isMl,
      disabled: isWebsite || isApp || isBackend,
    },
  ];

  return (
    <ModalContent>
      <ModalHeader title="Create project" />
      <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <InputWithLabel
          label="Project name"
          placeholder="Eg. My music site"
          {...form.register('project')}
          error={form.formState.errors.project?.message}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {trackingOptions.map(({ key, label, description, Icon, active, disabled }) => (
            <Controller
              control={form.control}
              key={key}
              name={key}
              render={({ field }) => (
                <button
                  className={cn(
                    'flex min-h-28 gap-3 rounded-md border p-4 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/40',
                    disabled && 'cursor-not-allowed opacity-50 hover:border-border'
                  )}
                  disabled={disabled}
                  onClick={() => field.onChange(!field.value)}
                  type="button"
                >
                  <Icon className="mt-0.5 size-5 shrink-0" />
                  <span className="grid gap-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm">
                      {description}
                    </span>
                  </span>
                </button>
              )}
            />
          ))}
        </div>
        {(form.formState.errors.website?.message ||
          form.formState.errors.app?.message ||
          form.formState.errors.backend?.message ||
          form.formState.errors.ml?.message) && (
          <p className="text-destructive text-sm">
            At least one type must be selected
          </p>
        )}

        <AnimateHeight open={isWebsite}>
          <div className="rounded-md border p-4">
            <InputWithLabel
              label="Domain"
              placeholder="Your website address"
              {...form.register('domain')}
              className="mb-4"
              error={form.formState.errors.domain?.message}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (
                  value.includes('.') &&
                  form.getValues().cors.length === 0 &&
                  !form.formState.errors.domain
                ) {
                  form.setValue('cors', [value]);
                }
              }}
            />

            <Controller
              control={form.control}
              name="cors"
              render={({ field }) => (
                <WithLabel label="Allowed domains">
                  <TagInput
                    {...field}
                    error={form.formState.errors.cors?.message}
                    onChange={(newValue) => {
                      field.onChange(
                        newValue.map((item) => {
                          const trimmed = item.trim();
                          if (
                            trimmed.startsWith('http://') ||
                            trimmed.startsWith('https://') ||
                            trimmed === '*'
                          ) {
                            return trimmed;
                          }
                          return `https://${trimmed}`;
                        })
                      );
                    }}
                    placeholder="Accept events from these domains"
                    renderTag={(tag) =>
                      tag === '*'
                        ? 'Accept events from any domains'
                        : tag
                    }
                    value={field.value ?? []}
                  />
                </WithLabel>
              )}
            />
          </div>
        </AnimateHeight>

        <ButtonContainer className="justify-end">
          <Button
            icon={SaveIcon}
            loading={mutation.isPending}
            type="submit"
          >
            Create project
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
