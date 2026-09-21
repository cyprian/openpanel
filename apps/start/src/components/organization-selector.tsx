import type { IServiceOrganization } from '@openpanel/db';
import { Link, useRouter } from '@tanstack/react-router';
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/use-app-params';

interface OrganizationSelectorProps {
  organizations?: IServiceOrganization[];
  align?: 'start' | 'end';
}

export default function OrganizationSelector({
  organizations,
  align = 'start',
}: OrganizationSelectorProps) {
  const router = useRouter();
  const { organizationId } = useAppParams();
  const [open, setOpen] = useState(false);

  const changeOrganization = (newOrganizationId: string) => {
    router.navigate({
      to: '/$organizationId',
      params: {
        organizationId: newOrganizationId,
      },
    });
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-start"
          aria-label="Select organization"
          size={'sm'}
          variant="outline"
        >
          <Building2Icon className="shrink-0" size={16} />
          <span className="mx-2 truncate">
            {organizations?.find((o) => o.id === organizationId)?.name ??
              'Select organization'}
          </span>
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[200px]">
        {!!organizations && (
          <>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            <DropdownMenuGroup>
              {organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.id}
                  onClick={() => changeOrganization(organization.id)}
                >
                  {organization.name}
                  {organization.id === organizationId && (
                    <DropdownMenuShortcut>
                      <CheckIcon size={16} />
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={'/onboarding/project'}>
                  New organization
                  <DropdownMenuShortcut>
                    <PlusIcon size={16} />
                  </DropdownMenuShortcut>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
