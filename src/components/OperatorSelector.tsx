import { Bus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPERATORS } from "@/types/gtfs";

interface OperatorSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function OperatorSelector({ value, onChange }: OperatorSelectorProps) {
  const selectedOperator = OPERATORS.find(op => op.id === value);
  
  return (
    <div className="flex items-center gap-2">
      <Bus className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue>
            {selectedOperator?.name || 'Όλοι οι φορείς'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((operator) => (
            <SelectItem key={operator.id} value={operator.id}>
              <span className="flex items-center gap-2">
                {operator.name}
                {operator.city && (
                  <span className="text-muted-foreground text-xs">
                    ({operator.city})
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
