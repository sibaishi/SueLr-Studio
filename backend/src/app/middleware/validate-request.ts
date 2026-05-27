type NextFunction = (error?: unknown) => void;
type Validator<TInput, TOutput> = (input: TInput) => TOutput;
type MapInput<TInput, TMapped> = (input: TInput) => TMapped;

interface BodyRequest<TBody> {
  body: TBody;
}

interface ParamRequest<TValue> {
  params: Record<string, TValue>;
}

export function validateBody<TInput, TOutput>(validator: Validator<TInput, TOutput>) {
  return (req: BodyRequest<TInput | TOutput>, _res: unknown, next: NextFunction): void => {
    try {
      req.body = validator(req.body as TInput);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParam<TInput = unknown, TMapped = TInput, TOutput = TMapped>(
  name: string,
  validator: Validator<TMapped, TOutput>,
  mapInput: MapInput<TInput, TMapped> = (value) => value as unknown as TMapped,
) {
  return (req: ParamRequest<TInput | TOutput>, _res: unknown, next: NextFunction): void => {
    try {
      req.params[name] = validator(mapInput(req.params[name] as TInput)) as TInput | TOutput;
      next();
    } catch (error) {
      next(error);
    }
  };
}
