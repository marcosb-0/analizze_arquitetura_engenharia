import { Calendar, DateField, DatePicker, I18nProvider } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import type { CampoRenderProps } from './Field';

/**
 * Seletor de data do HeroUI v3 atrás
 * da mesma interface do `<Input type="date">` — valor e retorno em
 * 'AAAA-MM-DD', para a tela não saber que a biblioteca existe.
 */
interface CampoDataProps extends Partial<CampoRenderProps> {
  value: string;
  onChange: (valor: string) => void;
  /** O `Field` rotula por `htmlFor`, que não alcança um grupo de segmentos. */
  rotulo: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}

export function CampoData({ value, onChange, rotulo, min, max, disabled, id, ...aria }: CampoDataProps) {
  return (
    <I18nProvider locale="pt-BR">
      <DatePicker
        id={id}
        aria-label={rotulo}
        aria-describedby={aria['aria-describedby']}
        isInvalid={aria['aria-invalid']}
        isRequired={aria['aria-required']}
        isDisabled={disabled}
        value={value ? parseDate(value) : null}
        minValue={min ? parseDate(min) : undefined}
        maxValue={max ? parseDate(max) : undefined}
        onChange={(d) => onChange(d ? d.toString() : '')}
        className="w-full"
      >
        <DateField.Group fullWidth className="h-10 border border-slate-200 text-xs shadow-none">
          <DateField.Input>{(segmento) => <DateField.Segment segment={segmento} />}</DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={rotulo}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(dia) => <Calendar.HeaderCell>{dia}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(data) => <Calendar.Cell date={data} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}
