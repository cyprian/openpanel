import { zodResolver } from '@hookform/resolvers/zod';
import { shortId } from '@openpanel/common';
import { zCreateNotificationRule } from '@openpanel/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FilterIcon, PlusIcon, SaveIcon, TrashIcon } from 'lucide-react';
import {
  Controller,
  type SubmitHandler,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';
import { ColorSquare } from '@/components/color-square';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { useEventProperties } from '@/hooks/use-event-properties';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

interface Props {
  rule?: RouterOutputs['notification']['rules'][number];
  defaults?: Partial<IForm>;
  slackOnly?: boolean;
}

type IForm = z.infer<typeof zCreateNotificationRule>;

export default function AddNotificationRule({ rule, defaults, slackOnly = false }: Props) {
  const client = useQueryClient();
  const { organizationId, projectId } = useAppParams();
  const form = useForm<IForm>({
    resolver: zodResolver(zCreateNotificationRule),
    defaultValues: {
      id: rule?.id ?? '',
      name: rule?.name ?? defaults?.name ?? '',
      sendToApp: rule?.sendToApp ?? false,
      sendToEmail: rule?.sendToEmail ?? false,
      integrations:
        rule?.integrations.map((integration) => integration.id) ?? defaults?.integrations ?? [],
      projectId,
      template: rule?.template ?? defaults?.template ?? '',
      config: rule?.config ?? defaults?.config ?? {
        type: 'events',
        events: [
          {
            name: '',
            segment: 'event',
            filters: [],
          },
        ],
      },
    },
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.notification.createOrUpdateRule.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        toast.success(
          rule ? 'Notification rule updated' : 'Notification rule created'
        );
        client.refetchQueries(
          trpc.notification.rules.queryFilter({
            projectId,
          })
        );
        popModal();
      },
    })
  );
  const integrationsQuery = useQuery(
    trpc.integration.list.queryOptions({
      organizationId: organizationId!,
    })
  );

  const eventsArray = useFieldArray({
    control: form.control,
    name: 'config.events',
  });

  const onSubmit: SubmitHandler<IForm> = (data) => {
    if (!data.config.events[0]?.name) {
      toast.error('At least one event is required');
      return;
    }
    if (slackOnly && data.integrations.length === 0) {
      toast.error('Choose a Slack destination');
      return;
    }
    mutation.mutate(data);
  };

  const integrations = (integrationsQuery.data ?? []).filter(
    (integration) => !slackOnly || integration.config.type === 'slack'
  );

  const createTitle = slackOnly ? 'Notify in Slack' : 'Create rule';

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title={rule ? 'Edit rule' : createTitle} />
      {slackOnly && (
        <p className="mb-4 text-sm text-muted-foreground">
          Get notified when this metric improves in this run. Choose a connected
          Slack destination below; its channel is configured by the integration.
        </p>
      )}
      <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <InputWithLabel
          error={form.formState.errors.name?.message}
          label="Rule name"
          placeholder="Eg. Sign ups on android"
          {...form.register('name')}
        />

        {!slackOnly && <>
        <WithLabel
          // @ts-expect-error
          error={form.formState.errors.config?.type.message}
          label="Type"
        >
          <Controller
            control={form.control}
            name="config.type"
            render={({ field }) => (
              <Combobox
                {...field}
                className="w-full"
                // @ts-expect-error
                error={form.formState.errors.config?.type.message}
                items={[
                  {
                    label: 'Events',
                    value: 'events',
                  },
                  {
                    label: 'Funnel',
                    value: 'funnel',
                  },
                ]}
                placeholder="Select type"
              />
            )}
          />
        </WithLabel>
        <WithLabel label="Events">
          <div className="col gap-2">
            {eventsArray.fields.map((field, index) => {
              return (
                <EventField
                  form={form}
                  index={index}
                  key={field.id}
                  remove={() => eventsArray.remove(index)}
                />
              );
            })}
            <Button
              className="self-start"
              icon={PlusIcon}
              onClick={() =>
                eventsArray.append({
                  name: '',
                  filters: [],
                  segment: 'event',
                })
              }
              variant={'outline'}
            >
              Add event
            </Button>
          </div>
        </WithLabel>

        </>}
        <WithLabel
          info={
            <div className="prose dark:prose-invert">
              <p>
                Customize your notification message. You can grab any property
                from your event.
              </p>

              <ul>
                <li>
                  <code>{'{{name}}'}</code> - The name of the event
                </li>
                <li>
                  <code>{'{{rule_name}}'}</code> - The name of the rule
                </li>
                <li>
                  <code>{'{{properties.your.property}}'}</code> - Get the value
                  of a custom property
                </li>
                <li>
                  <code>{'{{profile.firstName}}'}</code> - Get the value of a
                  profile property
                </li>
                <li>
                  <div className="flex flex-wrap gap-x-2">
                    And many more...
                    <code>profileId</code>
                    <code>createdAt</code>
                    <code>country</code>
                    <code>city</code>
                    <code>os</code>
                    <code>osVersion</code>
                    <code>browser</code>
                    <code>browserVersion</code>
                    <code>device</code>
                    <code>brand</code>
                    <code>model</code>
                    <code>path</code>
                    <code>origin</code>
                    <code>referrer</code>
                    <code>referrerName</code>
                    <code>referrerType</code>
                  </div>
                </li>
              </ul>
            </div>
          }
          label="Template"
        >
          <Textarea
            {...form.register('template')}
            placeholder="You received a new '$EVENT_NAME' event"
          />
        </WithLabel>

        <Controller
          control={form.control}
          name="integrations"
          render={({ field }) => (
            <WithLabel label={slackOnly ? 'Slack destinations' : 'Integrations'}>
              <ComboboxAdvanced
                {...field}
                className="w-full"
                items={integrations.map((integration) => ({
                  label: integration.config.type === 'slack'
                    ? `${integration.name} (${integration.config.incoming_webhook.channel})`
                    : integration.name,
                  value: integration.id,
                }))}
                placeholder={slackOnly ? 'Choose Slack destinations' : 'Pick integrations'}
                value={field.value ?? []}
              />
            </WithLabel>
          )}
        />

        {slackOnly && integrationsQuery.isError && (
          <p role="alert">Could not load Slack destinations. <button type="button" className="underline" onClick={() => integrationsQuery.refetch()}>Retry</button></p>
        )}
        {slackOnly && integrationsQuery.isSuccess && integrations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No Slack destinations connected.{' '}
            <Link to="/$organizationId/integrations/available" params={{ organizationId: organizationId! }} onClick={() => popModal()} className="underline">
              Connect Slack
            </Link>
          </p>
        )}
        <Button icon={SaveIcon} type="submit" disabled={mutation.isPending || (slackOnly && (integrationsQuery.isPending || integrationsQuery.isError || integrations.length === 0))}>
          {rule ? 'Update' : 'Create'}
        </Button>
      </form>
    </SheetContent>
  );
}

function EventField({
  form,
  index,
  remove,
}: {
  form: UseFormReturn<IForm>;
  index: number;
  remove: () => void;
}) {
  const { projectId } = useAppParams();
  const eventNames = useEventNames({ projectId });
  const filtersArray = useFieldArray({
    control: form.control,
    name: `config.events.${index}.filters`,
  });
  const eventName = useWatch({
    control: form.control,
    name: `config.events.${index}.name`,
  });
  const properties = useEventProperties({ projectId });

  return (
    <div className="rounded border bg-def-100">
      <div className="row items-center gap-2 p-2">
        <ColorSquare>{index + 1}</ColorSquare>
        <Controller
          control={form.control}
          name={`config.events.${index}.name`}
          render={({ field }) => (
            <ComboboxEvents
              className="flex-1"
              items={eventNames}
              onChange={field.onChange}
              placeholder="Select event"
              searchable
              value={field.value}
            />
          )}
        />
        <Combobox
          items={properties.map((item) => ({
            label: item,
            value: item,
          }))}
          onChange={(value) => {
            filtersArray.append({
              id: shortId(),
              name: value,
              operator: 'is',
              value: [],
            });
          }}
          placeholder="Select a filter"
          searchable
          value=""
        >
          <Button icon={FilterIcon} size={'icon'} variant={'outline'} />
        </Combobox>
        <Button
          className="text-destructive"
          icon={TrashIcon}
          onClick={() => {
            remove();
          }}
          size={'icon'}
          variant={'outline'}
        />
      </div>
      {filtersArray.fields.map((filter, index) => {
        return (
          <div className="border-t p-2" key={filter.id}>
            <PureFilterItem
              eventName={eventName}
              filter={filter}
              onChangeOperator={(operator) => {
                filtersArray.update(index, {
                  ...filter,
                  operator,
                });
              }}
              onChangeValue={(value) => {
                filtersArray.update(index, {
                  ...filter,
                  value,
                });
              }}
              onRemove={() => {
                filtersArray.remove(index);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
