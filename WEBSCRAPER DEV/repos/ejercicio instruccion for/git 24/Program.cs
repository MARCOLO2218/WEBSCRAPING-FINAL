using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace git_24
{
    internal class Program
    {
        static void Main(string[] args)
        {
            //Asignación compuesta (x -= 5)  == (x = x - 5)
            //(acumulador = acumulador + variable)  == (Acumulador +=  variable)

            //variables
            byte i, numAlumnos;
            double calificacion, sumaCalif = 0, promedio;

            Console.WriteLine("Ingresa el numero de alumnos: ");
            numAlumnos = Convert.ToByte(Console.ReadLine());

            for (i = 1; i <= numAlumnos; i++)
            {
                Console.WriteLine("Ingresa la calificacion: ");
                calificacion = Convert.ToDouble(Console.ReadLine());

                sumaCalif += calificacion;
            }
            //calculamos el promedio
            promedio = sumaCalif / numAlumnos;

            //mostramos el promedio
            Console.WriteLine("El promedio es: {0} ", promedio);
        }
    }
}
