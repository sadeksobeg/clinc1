import { Component, Input } from '@angular/core';

type McGap = 'sm' | 'md' | 'lg';

@Component({
  selector: 'mc-stack',
  standalone: true,
  template: `<div class="mc-stack" [class]="stackClass"><ng-content></ng-content></div>`,
})
export class McStackComponent {
  @Input() gap: McGap = 'md';

  get stackClass(): string {
    if (this.gap === 'sm') return 'grid gap-2';
    if (this.gap === 'lg') return 'grid gap-6';
    return 'grid gap-4';
  }
}

