import {Image, Text, VStack} from '@expo/ui/swift-ui';
import {font, frame, lineLimit, widgetURL} from '@expo/ui/swift-ui/modifiers';
import {createWidget} from 'expo-widgets';
export type MomentWidgetProps = {image:string;caption:string;date:string;url:string};
const MomentLayout = (props:MomentWidgetProps) => {
 'widget';
 return <VStack modifiers={[widgetURL(props.url||'mymap://moments')]}>
  <Text modifiers={[font({size:14,weight:'bold'})]}>MyMap · Khoảnh khắc</Text>
  {props.image?<Image uiImage={props.image} modifiers={[frame({height:85})]}/>:<Image systemName="photo.on.rectangle" size={32}/>}
  <Text modifiers={[lineLimit(2)]}>{props.caption||'Mở MyMap để chọn khoảnh khắc'}</Text>
  {!!props.date&&<Text modifiers={[font({size:11})]}>{props.date}</Text>}
 </VStack>;
};
export default createWidget<MomentWidgetProps>('MyMapMomentWidget',MomentLayout);
