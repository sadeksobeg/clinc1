import { Component, Input } from '@angular/core';

type McCols = '2' | '3' | '4';
type McGap = 'sm' | 'md' | 'lg';

@Component({
  selector: 'mc-grid',
  standalone: true,
  template: `<div [class]="gridClass"><ng-content></ng-content></div>`,
})
export class McGridComponent {
  @Input() cols: McCols = '2';
  @Input() gap: McGap = 'md';

  get gridClass(): string {
    const colClass = this.cols === '4' ? 'grid md:grid-cols-4' : this.cols === '3' ? 'grid md:grid-cols-3' : 'grid md:grid-cols-2';
    const gapClass = this.gap === 'sm' ? 'gap-2' : this.gap === 'lg' ? 'gap-6' : 'gap-4';
    return `${colClass} ${gapClass}`;
  }
}

