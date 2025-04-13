import Canvas, { type Image } from 'canvas';

export default function getImage(imgPath: string): Promise<Image> {
    return new Promise((async resolve => {
        const image = await Canvas.loadImage(imgPath);
        resolve(image);
    }));
}