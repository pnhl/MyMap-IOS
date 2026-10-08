import React, {forwardRef} from 'react';
import {TextInput as NativeTextInput, type TextInputProps} from 'react-native';
import {translate, useLanguage} from '../i18n/languages';

export type TextInput = NativeTextInput;
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function LocalizedTextInput(props, ref) {
  const language = useLanguage();
  return <NativeTextInput {...props} ref={ref}
    placeholder={props.placeholder ? translate(props.placeholder, language) : undefined}
    accessibilityLabel={props.accessibilityLabel ? translate(props.accessibilityLabel, language) : undefined}
    style={[{writingDirection: language === 'ar' || language === 'he' ? 'rtl' : 'auto'}, props.style]}
  />;
});
