const DEFAULT_MAX_OUTPUT_LENGTH=40000;

export function verifyTextOutput(value,{label='output',maxLength=DEFAULT_MAX_OUTPUT_LENGTH}={}) {
  const checks=[];
  const isText=typeof value==='string';
  checks.push({id:'string',passed:isText});
  const nonEmpty=isText&&value.trim().length>0;
  checks.push({id:'non_empty',passed:nonEmpty});
  const withinLimit=isText&&value.length<=maxLength;
  checks.push({id:'maximum_length',passed:withinLimit,limit:maxLength});
  const noNullBytes=isText&&!value.includes('\u0000');
  checks.push({id:'no_null_bytes',passed:noNullBytes});
  const passed=checks.every(check=>check.passed);
  return {
    passed,
    label,
    checks,
    scope:'structural_only',
    limitation:'This gate checks output structure and size; it does not independently establish factual accuracy, source validity, or completeness.'
  };
}
