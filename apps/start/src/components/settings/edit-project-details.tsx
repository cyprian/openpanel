import AnimateHeight from '@/components/animate-height';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { zProject } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, SaveIcon, TrashIcon, UploadIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

type Props = { project: IServiceProjectWithClients };
const DEFAULT_LOGO_SRC = '/logo.png';
const MAX_LOGO_BYTES = 384 * 1024;
const SUPPORTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const validator = zProject.pick({
  name: true,
  id: true,
  logo: true,
  domain: true,
  cors: true,
  crossDomain: true,
  allowUnsafeRevenueTracking: true,
  enableLocationLookup: true,
});
type IForm = z.infer<typeof validator>;

export default function EditProjectDetails({ project }: Props) {
  const [hasDomain, setHasDomain] = useState(project.domain !== null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id: project.id,
      name: project.name,
      logo: project.logo,
      domain: project.domain,
      cors: project.cors,
      crossDomain: project.crossDomain,
      allowUnsafeRevenueTracking: project.allowUnsafeRevenueTracking,
      enableLocationLookup: project.enableLocationLookup,
    },
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project updated');
        queryClient.invalidateQueries(
          trpc.project.list.queryFilter({
            organizationId: project.organizationId,
          }),
        );
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          }),
        );
      },
    }),
  );

  const onSubmit = (values: IForm) => {
    if (hasDomain) {
      let error = false;
      if (values.cors.length === 0) {
        form.setError('cors', {
          type: 'required',
          message: 'Please add at least one cors domain',
        });
        error = true;
      }

      if (!values.domain) {
        form.setError('domain', {
          type: 'required',
          message: 'Please add a domain',
        });
        error = true;
      }

      if (error) {
        return;
      }
    }

    mutation.mutate(hasDomain ? values : { ...values, cors: [], domain: null });
  };

  const logo = form.watch('logo');
  const logoError = form.formState.errors.logo?.message;

  const onLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (
      !SUPPORTED_LOGO_TYPES.includes(
        file.type as (typeof SUPPORTED_LOGO_TYPES)[number],
      )
    ) {
      form.setError('logo', {
        type: 'validate',
        message: 'Use a PNG, JPG, or WebP image.',
      });
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      form.setError('logo', {
        type: 'max',
        message: 'Logo must be 384 KB or smaller.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        form.setError('logo', {
          type: 'validate',
          message: 'Could not read the selected image.',
        });
        return;
      }

      form.clearErrors('logo');
      form.setValue('logo', reader.result, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    };
    reader.onerror = () => {
      form.setError('logo', {
        type: 'validate',
        message: 'Could not read the selected image.',
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">Details</span>
      </WidgetHead>
      <WidgetBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
          <InputWithLabel
            label="Name"
            {...form.register('name')}
            defaultValue={project.name}
          />

          <WithLabel label="Logo" error={logoError}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="center-center size-16 shrink-0 rounded-md border border-border bg-def-100">
                <img
                  src={logo || DEFAULT_LOGO_SRC}
                  className={cn(
                    'max-h-12 max-w-12 rounded-md',
                    !logo && 'opacity-80',
                  )}
                  alt="Project logo"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={logo ? ImageIcon : UploadIcon}
                  onClick={() => logoInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  {logo ? 'Change logo' : 'Upload logo'}
                </Button>
                <input
                  accept={SUPPORTED_LOGO_TYPES.join(',')}
                  className="sr-only"
                  onChange={onLogoChange}
                  ref={logoInputRef}
                  type="file"
                />
                {logo && (
                  <Button
                    icon={TrashIcon}
                    onClick={() =>
                      form.setValue('logo', null, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Delete logo
                  </Button>
                )}
              </div>
            </div>
          </WithLabel>

          <div className="-mb-2 flex gap-2 items-center justify-between">
            <Label className="mb-0">Domain</Label>
            <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
          </div>
          <AnimateHeight open={hasDomain}>
            <Input
              placeholder="https://example.com"
              {...form.register('domain')}
              className="mb-4"
              error={form.formState.errors.domain?.message}
              defaultValue={project.domain ?? ''}
            />

            <Controller
              name="cors"
              control={form.control}
              render={({ field }) => (
                <WithLabel
                  label="Allowed domains"
                  error={form.formState.errors.cors?.message}
                >
                  <TagInput
                    {...field}
                    error={form.formState.errors.cors?.message}
                    placeholder="Add a domain"
                    value={field.value ?? []}
                    renderTag={(tag) =>
                      tag === '*' ? 'Allow all domains' : tag
                    }
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
                        }),
                      );
                    }}
                  />
                </WithLabel>
              )}
            />
            <Controller
              name="crossDomain"
              control={form.control}
              render={({ field }) => {
                return (
                  <WithLabel label="Cross domain support" className="mt-4">
                    <CheckboxInput
                      ref={field.ref}
                      onBlur={field.onBlur}
                      defaultChecked={field.value}
                      onCheckedChange={field.onChange}
                    >
                      <div>Enable cross domain support</div>
                      <div className="font-normal text-muted-foreground">
                        This will let you track users across multiple domains
                      </div>
                    </CheckboxInput>
                  </WithLabel>
                );
              }}
            />
          </AnimateHeight>

          <Controller
            name="allowUnsafeRevenueTracking"
            control={form.control}
            render={({ field }) => {
              return (
                <WithLabel label="Revenue tracking">
                  <CheckboxInput
                    ref={field.ref}
                    onBlur={field.onBlur}
                    defaultChecked={field.value}
                    onCheckedChange={field.onChange}
                  >
                    <div>Allow "unsafe" revenue tracking</div>
                    <div className="font-normal text-muted-foreground">
                      With this enabled, you can track revenue from client code.
                    </div>
                  </CheckboxInput>
                </WithLabel>
              );
            }}
          />

          <Controller
            name="enableLocationLookup"
            control={form.control}
            render={({ field }) => {
              return (
                <WithLabel label="Location lookup API">
                  <CheckboxInput
                    ref={field.ref}
                    onBlur={field.onBlur}
                    defaultChecked={field.value}
                    onCheckedChange={field.onChange}
                  >
                    <div>Enable location lookup API</div>
                    <div className="font-normal text-muted-foreground">
                      Allow API clients with a client secret to resolve their
                      request country.
                    </div>
                  </CheckboxInput>
                </WithLabel>
              );
            }}
          />

          <Button
            loading={mutation.isPending}
            type="submit"
            icon={SaveIcon}
            className="self-start"
          >
            Save
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
