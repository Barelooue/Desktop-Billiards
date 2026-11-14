"""Generate the small native application glyph without image dependencies."""
import math,struct,zlib,pathlib
size=64
pixels=[]
for y in range(size):
    row=bytearray([0])
    for x in range(size):
        d=math.hypot(x-31.5,y-31.5)
        if d>30.5: c=(0,0,0,0)
        elif d>24: c=(196,230,187,255)
        elif d>20.5: c=(21,38,29,255)
        else:
            f=max(0,min(1,1-math.hypot(x-24,y-22)/50))
            c=(int(157+55*f),int(189+48*f),int(150+48*f),255)
        row.extend(c)
    pixels.append(row)
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b'')
ico=struct.pack('<HHH',0,1,1)+struct.pack('<BBBBHHII',size,size,0,0,1,32,len(png),22)+png
pathlib.Path(__file__).resolve().parents[1].joinpath('native/app.ico').write_bytes(ico)
